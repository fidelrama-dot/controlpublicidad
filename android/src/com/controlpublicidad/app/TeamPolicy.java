package com.controlpublicidad.app;

import org.json.*;
import java.io.IOException;
import java.util.*;

/** The native beta uses the same campaign/branch hierarchy as the server. */
public final class TeamPolicy {
 public static boolean manages(JSONObject actor){return actor!=null&&actor.optBoolean("active",true)&&!actor.optBoolean("deleted")&&Arrays.asList("admin","leader","coordinator").contains(actor.optString("role"));}
 public static String[] roles(JSONObject actor)throws IOException{
  if(!manages(actor))throw new IOException("Tu perfil no permite dar de alta usuarios.");
  return "admin".equals(actor.optString("role"))?new String[]{"leader","coordinator","collaborator"}:new String[]{"leader".equals(actor.optString("role"))?"coordinator":"collaborator"};
 }
 public static String contact(String raw)throws IOException{
  String value=raw==null?"":raw.trim();if(value.length()>150)throw new IOException("Contacto demasiado largo.");
  if(value.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))return value.toLowerCase(Locale.ROOT);
  value=value.replaceAll("[ ()-]","");if(value.matches("\\+[1-9][0-9]{7,14}"))return value;
  throw new IOException("Ingresa un correo o celular con código de país, por ejemplo +52.");
 }
 private static String text(JSONObject input,String key,int max,String label)throws IOException{
  Object raw=input.opt(key);if(!(raw instanceof String))throw new IOException(label+" inválido.");String value=((String)raw).trim();if(value.isEmpty()||value.length()>max)throw new IOException(label+": completa el campo (máximo "+max+" caracteres).");return value;
 }
 public static boolean activeBranch(JSONObject data,JSONObject member)throws Exception{
  JSONObject c=Policy.find(data.getJSONArray("campaigns"),"id",member.optString("campaignId"));if(c==null||!"active".equals(c.optString("status")))return false;
  JSONObject current=member;Set<String> seen=new HashSet<>();String campaign=member.getString("campaignId");
  while(current!=null){if(!seen.add(current.getString("id"))||!campaign.equals(current.optString("campaignId"))||!"active".equals(current.optString("status")))return false;
   JSONObject user=Policy.find(data.getJSONArray("users"),"id",current.optString("userId"));if(user==null||!user.optBoolean("active",true)||user.optBoolean("deleted")||!user.optString("role").equals(current.optString("role")))return false;
   String parent=current.optString("parentId","");if(parent.isEmpty()||current.isNull("parentId"))return "leader".equals(current.optString("role"));
   String expected="coordinator".equals(current.optString("role"))?"leader":"collaborator".equals(current.optString("role"))?"coordinator":"";
   current=Policy.find(data.getJSONArray("memberships"),"id",parent);if(current==null||!expected.equals(current.optString("role")))return false;
  }return false;
 }
 public static List<JSONObject> parents(JSONObject data,JSONObject actor,String role,boolean remote)throws Exception{
  List<JSONObject> out=new ArrayList<>();if(!Arrays.asList(roles(actor)).contains(role)||"leader".equals(role))return out;
  String expected="coordinator".equals(role)?"leader":"coordinator";JSONArray members=data.getJSONArray("memberships");
  for(int i=0;i<members.length();i++){JSONObject m=members.getJSONObject(i);if(!expected.equals(m.optString("role"))||!"active".equals(m.optString("status")))continue;
   JSONObject c=Policy.find(data.getJSONArray("campaigns"),"id",m.optString("campaignId")),u=Policy.find(data.getJSONArray("users"),"id",m.optString("userId"));if(c==null||!"active".equals(c.optString("status"))||u==null||u.optBoolean("deleted")||!u.optBoolean("active",true))continue;
   if(!"admin".equals(actor.optString("role"))&&!actor.getString("id").equals(m.optString("userId")))continue;
   // Remote bootstrap is intentionally scoped. The server checks all omitted ancestors.
   if(!remote&&!activeBranch(data,m))continue;out.add(m);
  }return out;
 }
 public static JSONObject userInput(JSONObject data,JSONObject actor,JSONObject input,boolean remote)throws Exception{
  String role=input.optString("role");if(!Arrays.asList(roles(actor)).contains(role))throw new IOException("Solo puedes dar de alta el nivel inferior que te corresponde.");
  JSONObject valid=new JSONObject().put("name",text(input,"name",80,"Nombre")).put("contact",contact(input.optString("contact"))).put("role",role);
  JSONArray users=data.getJSONArray("users");for(int i=0;i<users.length();i++){JSONObject u=users.getJSONObject(i);if(valid.getString("contact").equalsIgnoreCase(u.optString("contact")))throw new IOException("El contacto ya está registrado.");}
  if("leader".equals(role))return valid.put("campaignId",JSONObject.NULL).put("parentId",JSONObject.NULL);
  for(JSONObject p:parents(data,actor,role,remote))if(p.getString("id").equals(input.optString("parentId"))&&p.getString("campaignId").equals(input.optString("campaignId")))return valid.put("campaignId",p.getString("campaignId")).put("parentId",p.getString("id"));
  throw new IOException("Selecciona una campaña y un superior activo de tu propia rama.");
 }
 public static JSONObject campaignInput(JSONObject data,JSONObject actor,JSONObject input)throws Exception{
  if(!manages(actor)||!"admin".equals(actor.optString("role")))throw new IOException("Solo el administrador puede crear campañas.");
  JSONObject leader=Policy.find(data.getJSONArray("users"),"id",input.optString("leaderId"));if(leader==null||!"leader".equals(leader.optString("role"))||!leader.optBoolean("active",true)||leader.optBoolean("deleted"))throw new IOException("Selecciona un líder activo.");
  JSONArray types=input.optJSONArray("types");if(types==null||types.length()==0)throw new IOException("Selecciona al menos un tipo de campaña.");Set<String> seen=new HashSet<>();for(int i=0;i<types.length();i++){String t=types.getString(i);if(!Arrays.asList("lona","espectacular","barda").contains(t)||!seen.add(t))throw new IOException("Tipos de campaña inválidos.");}
  return new JSONObject().put("name",text(input,"name",100,"Nombre de campaña")).put("location",text(input,"location",150,"Ubicación")).put("leaderId",leader.getString("id")).put("types",new JSONArray(types.toString()));
 }
 public static List<JSONObject> scoped(JSONObject data,JSONObject actor)throws Exception{
  List<JSONObject> out=new ArrayList<>();if(!manages(actor))return out;JSONArray members=data.getJSONArray("memberships");Set<String> ids=new HashSet<>();
  if(!"admin".equals(actor.optString("role"))){for(int i=0;i<members.length();i++){JSONObject m=members.getJSONObject(i);if(actor.getString("id").equals(m.optString("userId"))&&"active".equals(m.optString("status")))ids.add(m.getString("id"));}
   boolean changed=true;while(changed){changed=false;for(int i=0;i<members.length();i++){JSONObject m=members.getJSONObject(i);if(ids.contains(m.optString("parentId"))&&ids.add(m.getString("id")))changed=true;}}
  }
  for(int i=0;i<members.length();i++){JSONObject m=members.getJSONObject(i);if("admin".equals(actor.optString("role"))||ids.contains(m.getString("id")))out.add(m);}return out;
 }
}
