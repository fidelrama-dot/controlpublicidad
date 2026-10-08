package com.controlpublicidad.app;

import org.json.*;
import java.util.UUID;

/** All local test profiles share one encrypted directory; records keep their own namespace. */
public final class TeamStore {
 private final RecordStore store;private static final String FILE="local-teams.json";
 public TeamStore(RecordStore store){this.store=store;}
 public synchronized JSONObject load(JSONObject seed)throws Exception{
  if(!store.files.exists(FILE)){JSONObject initial=new JSONObject(seed.toString());store.writeJson(FILE,initial);}
  return store.json(FILE);
 }
 public synchronized JSONObject createUser(JSONObject actor,JSONObject input)throws Exception{
  JSONObject data=store.json(FILE),current=Policy.find(data.getJSONArray("users"),"id",actor.getString("id"));JSONObject valid=TeamPolicy.userInput(data,current,input,false);String uid=UUID.randomUUID().toString();
  JSONObject user=new JSONObject().put("id",uid).put("name",valid.getString("name")).put("contact",valid.getString("contact")).put("role",valid.getString("role")).put("active",true);data.getJSONArray("users").put(user);
  if(!"leader".equals(valid.getString("role")))data.getJSONArray("memberships").put(new JSONObject().put("id",UUID.randomUUID().toString()).put("userId",uid).put("role",valid.getString("role")).put("campaignId",valid.getString("campaignId")).put("parentId",valid.getString("parentId")).put("displayName",valid.getString("name")).put("status","active"));
  store.writeJson(FILE,data);return user;
 }
 public synchronized JSONObject createCampaign(JSONObject actor,JSONObject input)throws Exception{
  JSONObject data=store.json(FILE),current=Policy.find(data.getJSONArray("users"),"id",actor.getString("id"));JSONObject campaign=TeamPolicy.campaignInput(data,current,input);String cid=UUID.randomUUID().toString();campaign.put("id",cid).put("status","active");data.getJSONArray("campaigns").put(campaign);
  data.getJSONArray("memberships").put(new JSONObject().put("id",UUID.randomUUID().toString()).put("userId",campaign.getString("leaderId")).put("campaignId",cid).put("role","leader").put("parentId",JSONObject.NULL).put("status","active"));
  store.writeJson(FILE,data);return campaign;
 }
}
