package com.controlpublicidad.app;
import org.json.*;import java.util.*;
public final class Policy {
 public static String role(String role){return "leader".equals(role)?"Líder":"coordinator".equals(role)?"Coordinador":"collaborator".equals(role)?"Colaborador":"Administrador";}
 public static String type(String type){return "lona".equals(type)?"Lona":"espectacular".equals(type)?"Espectacular":"Barda";}
 public static JSONObject find(JSONArray a,String key,String value)throws Exception{for(int i=0;i<a.length();i++){JSONObject o=a.getJSONObject(i);if(value.equals(o.optString(key)))return o;}return null;}
 public static List<JSONObject> assignments(JSONObject data,JSONObject actor,boolean remote)throws Exception{
  List<JSONObject> out=new ArrayList<>();String role=actor.getString("role");if(!Arrays.asList("leader","coordinator","collaborator").contains(role)||actor.optBoolean("deleted")||!actor.optBoolean("active",true))return out;
  JSONArray members=data.getJSONArray("memberships"),campaigns=data.getJSONArray("campaigns");
  for(int i=0;i<members.length();i++){
   JSONObject m=members.getJSONObject(i);if(!actor.getString("id").equals(m.optString("userId"))||!role.equals(m.optString("role"))||!"active".equals(m.optString("status")))continue;
   JSONObject c=find(campaigns,"id",m.getString("campaignId"));if(c==null||!"active".equals(c.optString("status"))||c.getJSONArray("types").length()==0)continue;
   boolean allowed=false;
   if(remote){JSONArray eligible=data.optJSONArray("captureAssignments");if(eligible!=null)for(int j=0;j<eligible.length();j++){JSONObject e=eligible.getJSONObject(j);if(m.getString("id").equals(e.optString("membershipId"))&&c.getString("id").equals(e.optString("campaignId")))allowed=true;}}
   else{
    JSONObject parent=m;Set<String> seen=new HashSet<>();allowed=true;
    while(!parent.isNull("parentId")&&!parent.optString("parentId").isEmpty()){
     if(!seen.add(parent.getString("id"))){allowed=false;break;}parent=find(members,"id",parent.getString("parentId"));if(parent==null||!"active".equals(parent.optString("status"))||!c.getString("id").equals(parent.optString("campaignId"))){allowed=false;break;}
    }
    allowed=allowed&&parent!=null&&"leader".equals(parent.optString("role"));
   }
   if(allowed)out.add(new JSONObject().put("campaign",c).put("membership",m));
  }
  return out;
 }
}
