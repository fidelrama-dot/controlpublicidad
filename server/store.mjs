import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

export class Store {
  constructor(path) {
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(path);
    this.db.exec(`
      PRAGMA foreign_keys=ON;
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK(role IN ('admin','leader','coordinator','collaborator')),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
      );
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, location TEXT NOT NULL,
        leader_id TEXT NOT NULL REFERENCES users(id), types TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active'
      );
      CREATE TABLE IF NOT EXISTS memberships (
        id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
        user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL CHECK(role IN ('leader','coordinator','collaborator')),
        parent_id TEXT REFERENCES memberships(id), status TEXT NOT NULL DEFAULT 'active',
        display_name TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_leader_per_campaign ON memberships(campaign_id) WHERE role='leader';
      CREATE TRIGGER IF NOT EXISTS valid_parent BEFORE INSERT ON memberships
      BEGIN
        SELECT CASE WHEN NEW.role='leader' AND NEW.parent_id IS NOT NULL THEN RAISE(ABORT,'Leader cannot have a parent') END;
        SELECT CASE WHEN NEW.role!='leader' AND NOT EXISTS (
          SELECT 1 FROM memberships p WHERE p.id=NEW.parent_id AND p.campaign_id=NEW.campaign_id
          AND p.role=CASE NEW.role WHEN 'coordinator' THEN 'leader' ELSE 'coordinator' END
        ) THEN RAISE(ABORT,'Invalid membership parent') END;
      END;
      CREATE TABLE IF NOT EXISTS invitations (
        id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, membership_id TEXT REFERENCES memberships(id),
        user_id TEXT NOT NULL REFERENCES users(id), contact TEXT NOT NULL, role TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
      );
      CREATE TABLE IF NOT EXISTS otp (
        contact TEXT PRIMARY KEY, hash TEXT NOT NULL, salt TEXT NOT NULL, expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, requested_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id), membership_id TEXT NOT NULL REFERENCES memberships(id),
        manifest TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'uploading', number INTEGER,
        created_at TEXT NOT NULL, received_at TEXT, UNIQUE(campaign_id,number)
      );
      CREATE TABLE IF NOT EXISTS chunks (
        record_id TEXT NOT NULL REFERENCES records(id), media_id TEXT NOT NULL, chunk_index INTEGER NOT NULL,
        hash TEXT NOT NULL, size INTEGER NOT NULL, PRIMARY KEY(record_id,media_id,chunk_index)
      );
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL REFERENCES users(id),
        campaign_id TEXT, action TEXT NOT NULL, target TEXT NOT NULL, at TEXT NOT NULL
      );
    `);
    // Version memberships on transfer so immutable records keep their original branch.
    if(/UNIQUE\s*\(campaign_id\s*,\s*user_id\)/i.test(this.get("SELECT sql FROM sqlite_master WHERE name='memberships'").sql)){
      this.db.exec(`PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;
        CREATE TABLE memberships_new(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id),user_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL CHECK(role IN ('leader','coordinator','collaborator')),parent_id TEXT REFERENCES memberships(id),status TEXT NOT NULL DEFAULT 'active',display_name TEXT);
        INSERT INTO memberships_new SELECT * FROM memberships;
        DROP TABLE memberships; ALTER TABLE memberships_new RENAME TO memberships;
        COMMIT; PRAGMA foreign_keys=ON;`);
    }
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS one_leader_per_campaign ON memberships(campaign_id) WHERE role='leader';
      CREATE UNIQUE INDEX IF NOT EXISTS current_campaign_user ON memberships(campaign_id,user_id) WHERE status!='transferred';
      CREATE TRIGGER IF NOT EXISTS valid_parent BEFORE INSERT ON memberships BEGIN
        SELECT CASE WHEN NEW.role='leader' AND NEW.parent_id IS NOT NULL THEN RAISE(ABORT,'Leader cannot have a parent') END;
        SELECT CASE WHEN NEW.role!='leader' AND NOT EXISTS(SELECT 1 FROM memberships p WHERE p.id=NEW.parent_id AND p.campaign_id=NEW.campaign_id AND p.role=CASE NEW.role WHEN 'coordinator' THEN 'leader' ELSE 'coordinator' END) THEN RAISE(ABORT,'Invalid membership parent') END;
      END;
      CREATE TRIGGER IF NOT EXISTS valid_parent_update BEFORE UPDATE OF parent_id,campaign_id,role ON memberships BEGIN
        SELECT CASE WHEN NEW.role='leader' AND NEW.parent_id IS NOT NULL THEN RAISE(ABORT,'Leader cannot have a parent') END;
        SELECT CASE WHEN NEW.role!='leader' AND NOT EXISTS(SELECT 1 FROM memberships p WHERE p.id=NEW.parent_id AND p.campaign_id=NEW.campaign_id AND p.role=CASE NEW.role WHEN 'coordinator' THEN 'leader' ELSE 'coordinator' END) THEN RAISE(ABORT,'Invalid membership parent') END;
      END;
    `);
  }
  get(sql,...params){return this.db.prepare(sql).get(...params);}
  all(sql,...params){return this.db.prepare(sql).all(...params);}
  run(sql,...params){return this.db.prepare(sql).run(...params);}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
  close(){this.db.close();}
  snapshot(){
    return {
      users:this.all('SELECT * FROM users').map(u=>({id:u.id,name:u.name,contact:u.contact,role:u.role,active:Boolean(u.active)})),
      campaigns:this.all('SELECT * FROM campaigns').map(c=>({id:c.id,name:c.name,location:c.location,leaderId:c.leader_id,types:JSON.parse(c.types),status:c.status,color:'mint'})),
      memberships:this.all('SELECT * FROM memberships').map(m=>({id:m.id,campaignId:m.campaign_id,userId:m.user_id,role:m.role,parentId:m.parent_id,status:m.status,displayName:m.display_name})),
      records:this.all('SELECT * FROM records').map(r=>({...JSON.parse(r.manifest),status:r.status,number:r.number,receivedAt:r.received_at})),
      invitations:this.all('SELECT id,membership_id,user_id,role,created_by,expires_at,status FROM invitations').map(i=>({id:i.id,membershipId:i.membership_id,userId:i.user_id,role:i.role,createdBy:i.created_by,expiresAt:i.expires_at,status:i.status})),
      audit:this.all('SELECT * FROM audit ORDER BY id DESC LIMIT 100').map(a=>({id:a.id,actorId:a.actor_id,campaignId:a.campaign_id,action:a.action,target:a.target,at:a.at}))
    };
  }
}
