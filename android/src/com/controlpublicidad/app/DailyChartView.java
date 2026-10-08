package com.controlpublicidad.app;

import android.app.Activity;import android.graphics.*;import android.view.*;
import org.json.*;import java.time.*;import java.util.*;

public final class DailyChartView extends View {
 public interface Selected{void click(String day,String label);}
 private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);private final TreeMap<String,int[]> counts=new TreeMap<>();private final List<Hit> hits=new ArrayList<>();private final Selected selected;private final float density;private float downX,downY;
 private static final class Hit{RectF rect;String day,label;Hit(RectF r,String d,String l){rect=r;day=d;label=l;}}
 public DailyChartView(Activity a,List<JSONObject> records,Selected selected)throws Exception{super(a);this.selected=selected;density=getResources().getDisplayMetrics().density;
  for(JSONObject r:records)if(!"draft".equals(r.optString("status"))){String d=day(r);if(!counts.containsKey(d))counts.put(d,new int[2]);int[] c=counts.get(d);c[0]+=RecordStore.count(r,"photo");c[1]+=RecordStore.count(r,"video");}
  while(counts.size()>7)counts.pollFirstEntry();setContentDescription("Evidencia por día. Fotografía verde, video azul. Toca una barra para filtrar.");setFocusable(true);
 }
 public static String day(JSONObject r){try{JSONArray a=r.getJSONArray("media");String at=a.length()>0?a.getJSONObject(0).getString("capturedAt"):r.getString("createdAt");return Instant.parse(at).atZone(ZoneId.of("America/Mexico_City")).toLocalDate().toString();}catch(Exception e){return "";}}
 private float dp(float v){return v*density;}
 @Override protected void onDraw(Canvas canvas){super.onDraw(canvas);hits.clear();float w=getWidth(),h=getHeight(),left=dp(34),top=dp(27),bottom=h-dp(35),right=w-dp(8);paint.setTypeface(Typeface.DEFAULT);paint.setTextSize(dp(11));
  if(counts.isEmpty()){paint.setColor(Ui.MUTED);canvas.drawText("Tus registros sellados aparecerán aquí.",0,h/2,paint);return;}
  int max=1;for(int[] c:counts.values())max=Math.max(max,Math.max(c[0],c[1]));int ceiling=Math.max(4,((max+3)/4)*4);
  for(int i=0;i<=4;i++){float y=bottom-(bottom-top)*i/4;paint.setColor(Ui.LINE);paint.setStrokeWidth(dp(1));canvas.drawLine(left,y,right,y,paint);paint.setColor(Ui.MUTED);paint.setTextAlign(Paint.Align.RIGHT);canvas.drawText(String.valueOf(ceiling*i/4),left-dp(7),y+dp(4),paint);}
  paint.setTextAlign(Paint.Align.LEFT);paint.setColor(Ui.GREEN);canvas.drawCircle(left+dp(4),dp(11),dp(4),paint);canvas.drawText("Fotos",left+dp(14),dp(15),paint);paint.setColor(Color.rgb(55,121,195));canvas.drawCircle(left+dp(80),dp(11),dp(4),paint);canvas.drawText("Videos",left+dp(90),dp(15),paint);
  float slot=(right-left)/counts.size(),bw=Math.min(dp(24),slot*.27f);int idx=0;
  for(Map.Entry<String,int[]> entry:counts.entrySet()){float x=left+slot*(idx+.5f);int[] c=entry.getValue();String label=entry.getKey()+": "+c[0]+" fotografías y "+c[1]+" videos";
   for(int kind=0;kind<2;kind++){float bx=x+(kind==0?-bw-dp(2):dp(2)),y=bottom-(bottom-top)*c[kind]/ceiling;paint.setColor(kind==0?Ui.GREEN:Color.rgb(55,121,195));canvas.drawRoundRect(bx,y,bx+bw,bottom,dp(4),dp(4),paint);hits.add(new Hit(new RectF(bx-dp(4),Math.min(y,bottom-dp(36)),bx+bw+dp(4),bottom+dp(12)),entry.getKey(),label));}
   paint.setColor(Ui.MUTED);paint.setTextAlign(Paint.Align.CENTER);canvas.drawText(entry.getKey().substring(5),x,bottom+dp(24),paint);idx++;
  }
 }
 @Override public boolean onTouchEvent(android.view.MotionEvent e){if(e.getAction()==MotionEvent.ACTION_DOWN){downX=e.getX();downY=e.getY();return true;}if(e.getAction()==MotionEvent.ACTION_UP){if(Math.abs(e.getX()-downX)+Math.abs(e.getY()-downY)>dp(18))return false;for(Hit h:hits)if(h.rect.contains(e.getX(),e.getY())){performClick();selected.click(h.day,h.label);return true;}}return super.onTouchEvent(e);}
 @Override public boolean performClick(){super.performClick();return true;}
}
