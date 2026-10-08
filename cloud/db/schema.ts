import {sqliteTable,text,integer,primaryKey,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const previewRecords=sqliteTable('preview_records',{
  ownerId:text('owner_id').notNull(),
  id:text('id').notNull(),
  campaignId:text('campaign_id').notNull(),
  payload:text('payload').notNull(),
  number:integer('number').notNull(),
  receivedAt:text('received_at').notNull(),
},table=>[
  primaryKey({columns:[table.ownerId,table.id]}),
  index('idx_preview_records_owner_received').on(table.ownerId,table.receivedAt),
  uniqueIndex('idx_preview_records_campaign_number').on(table.ownerId,table.campaignId,table.number),
]);

export const previewDeletions=sqliteTable('preview_deletions',{
  ownerId:text('owner_id').notNull(),
  id:text('id').notNull(),
  userId:text('user_id').notNull(),
  global:integer('global_account',{mode:'boolean'}).notNull(),
  name:text('name').notNull(),
  deletedAt:text('deleted_at').notNull(),
},table=>[primaryKey({columns:[table.ownerId,table.id]})]);
