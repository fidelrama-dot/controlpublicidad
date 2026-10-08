package com.controlpublicidad.app;

import android.Manifest;
import android.app.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.hardware.camera2.*;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.location.*;
import android.media.*;
import android.os.*;
import android.util.Size;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.time.Instant;
import java.util.*;

/** In-app Camera2 capture. Photos are encrypted immediately; recording has a private staging file. */
public final class CameraActivity extends Activity implements LocationListener {
 private TextureView texture;private TextView info;private Button shutter,done;
 private HandlerThread thread;private Handler worker;private Handler ui=new Handler(Looper.getMainLooper());
 private volatile CameraDevice camera;private volatile CameraCaptureSession session;private ImageReader reader;private Surface preview;
 private CameraCharacteristics chars;private String cameraId,kind,rid;private Size jpegSize,previewSize,videoSize;
 private MediaRecorder recorder;private boolean recording=false,busy=false,starting=false;private volatile boolean closing=false,opening=false;
 private RecordStore store;private volatile JSONObject pending;private File raw;
 private LocationManager locations;private Location fix;private long startElapsed;
 private final Runnable timer=new Runnable(){public void run(){if(recording){info.setText("Grabando · "+((SystemClock.elapsedRealtime()-startElapsed)/1000)+" s\n"+gpsText());ui.postDelayed(this,1000);}}};
 @Override public void onCreate(Bundle state){super.onCreate(state);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  try{store=Vault.get(this);rid=RecordStore.id(getIntent().getStringExtra("recordId"));kind=getIntent().getStringExtra("kind");JSONObject r=store.record(rid);if(!"draft".equals(r.optString("status")))throw new IOException("El registro ya está sellado.");if(!Arrays.asList("photo","video").contains(kind))throw new IOException("Captura inválida.");
   LinearLayout root=Ui.column(this);LinearLayout head=Ui.column(this);head.setPadding(Ui.dp(this,18),Ui.dp(this,8),Ui.dp(this,18),Ui.dp(this,8));head.addView(Ui.title(this,"photo".equals(kind)?"Tomar fotografía":"Grabar video"));head.addView(Ui.text(this,r.getString("campaignName")+" · "+Policy.type(r.getString("type")),14,Ui.MUTED));root.addView(head);
   texture=new TextureView(this);texture.setOpaque(true);root.addView(texture,new LinearLayout.LayoutParams(-1,0,1));
   LinearLayout controls=Ui.column(this);controls.setPadding(Ui.dp(this,18),Ui.dp(this,8),Ui.dp(this,18),Ui.dp(this,8));info=Ui.text(this,"Buscando GPS preciso…",14,Ui.INK);controls.addView(info);
   shutter=Ui.button(this,"photo".equals(kind)?"● Tomar foto":"● Iniciar grabación",()->{if(recording)stopRecording(false);else checkGpsAndCapture();});shutter.setEnabled(false);controls.addView(shutter);
   done=Ui.button(this,"Volver al registro",this::leave);Ui.secondary(this,done);controls.addView(done);root.addView(controls);Ui.root(this,root);
   thread=new HandlerThread("cp-camera");thread.start();worker=new Handler(thread.getLooper());
   texture.setSurfaceTextureListener(new TextureView.SurfaceTextureListener(){public void onSurfaceTextureAvailable(SurfaceTexture s,int w,int h){openCamera();}public void onSurfaceTextureSizeChanged(SurfaceTexture s,int w,int h){transform(w,h);}public boolean onSurfaceTextureDestroyed(SurfaceTexture s){return true;}public void onSurfaceTextureUpdated(SurfaceTexture s){}});
  }catch(Exception e){fail(e);}
 }
 @Override protected void onResume(){super.onResume();closing=false;startGps();if(texture!=null&&texture.isAvailable()&&camera==null)openCamera();}
 private void startGps(){
  try{locations=(LocationManager)getSystemService(LOCATION_SERVICE);if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){if(info!=null)info.setText("GPS sin permiso preciso. Puedes concederlo en Ajustes del teléfono.");return;}
   for(String provider:new String[]{LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER})if(locations.isProviderEnabled(provider)){Location l=locations.getLastKnownLocation(provider);if(fresh(l)&&(fix==null||l.getAccuracy()<fix.getAccuracy()))fix=l;locations.requestLocationUpdates(provider,1000,0,this);}
   refreshGps();
  }catch(Exception e){if(info!=null)info.setText("Activa la ubicación precisa del teléfono.");}
 }
 private boolean fresh(Location l){return l!=null&&l.hasAccuracy()&&l.getAccuracy()<=50&&SystemClock.elapsedRealtimeNanos()-l.getElapsedRealtimeNanos()>=0&&SystemClock.elapsedRealtimeNanos()-l.getElapsedRealtimeNanos()<=30_000_000_000L&&!l.isFromMockProvider();}
 private String gpsText(){return fresh(fix)?String.format(Locale.ROOT,"GPS %.6f, %.6f · precisión ±%.0f m",fix.getLatitude(),fix.getLongitude(),fix.getAccuracy()):"Sin lectura GPS precisa reciente";}
 private void refreshGps(){if(info!=null&&!busy&&!recording)info.setText(gpsText()+ ("video".equals(kind)?"\nMáximo 60 segundos por video.":"\nLa foto se guardará cifrada en este teléfono."));}
 public void onLocationChanged(Location l){if(l.isFromMockProvider())return;if(fresh(l))fix=l;refreshGps();}
 public void onStatusChanged(String p,int s,Bundle e){}public void onProviderEnabled(String p){refreshGps();}public void onProviderDisabled(String p){refreshGps();}
 private JSONObject gps()throws Exception{if(!fresh(fix))return null;return new JSONObject().put("lat",fix.getLatitude()).put("lng",fix.getLongitude()).put("accuracy",fix.getAccuracy()).put("capturedAt",Instant.ofEpochMilli(fix.getTime()).toString());}
 private void checkGpsAndCapture(){if(busy||starting||camera==null||session==null)return;
  if(!fresh(fix)){new AlertDialog.Builder(this).setTitle("Todavía no hay GPS preciso").setMessage("Espera una lectura de ubicación al aire libre. Si necesitas conservar la evidencia ahora, puedes tomarla sin coordenadas; quedará marcada como GPS no disponible.").setNegativeButton("Esperar GPS",null).setPositiveButton("Capturar sin GPS",(d,w)->capture()).show();}else capture();
 }
 private void capture(){try{pending=store.begin(rid,kind,gps());if("photo".equals(kind))photo();else startRecording();}catch(Exception e){fail(e);}}
 private void openCamera(){if(closing||opening||camera!=null||thread==null)return;opening=true;
  try{CameraManager manager=(CameraManager)getSystemService(CAMERA_SERVICE);cameraId=null;
   for(String id:manager.getCameraIdList()){CameraCharacteristics c=manager.getCameraCharacteristics(id);Integer facing=c.get(CameraCharacteristics.LENS_FACING);if(cameraId==null||facing!=null&&facing==CameraCharacteristics.LENS_FACING_BACK){cameraId=id;chars=c;if(facing!=null&&facing==CameraCharacteristics.LENS_FACING_BACK)break;}}
   if(cameraId==null)throw new IOException("No se encontró cámara.");StreamConfigurationMap map=chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
   jpegSize=choose(map.getOutputSizes(ImageFormat.JPEG),2048,1536,4.0/3);previewSize=choose(map.getOutputSizes(SurfaceTexture.class),1280,960,4.0/3);videoSize=choose(map.getOutputSizes(MediaRecorder.class),1280,720,16.0/9);
   if(reader!=null)reader.close();reader=ImageReader.newInstance(jpegSize.getWidth(),jpegSize.getHeight(),ImageFormat.JPEG,2);reader.setOnImageAvailableListener(this::image,worker);
   if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)throw new IOException("Permite el acceso a la cámara.");
   manager.openCamera(cameraId,new CameraDevice.StateCallback(){public void onOpened(CameraDevice c){opening=false;if(closing){c.close();return;}camera=c;preview();}public void onDisconnected(CameraDevice c){opening=false;c.close();camera=null;runOnUiThread(()->fail(new IOException("La cámara se desconectó. Se conserva el borrador.")));}public void onError(CameraDevice c,int code){opening=false;c.close();camera=null;runOnUiThread(()->fail(new IOException("La cámara no pudo abrirse ("+code+").")));}},worker);
  }catch(Exception e){opening=false;fail(e);}
 }
 private Size choose(Size[] list,int w,int h,double ratio)throws Exception{
  if(list==null||list.length==0)throw new IOException("Formato de cámara no disponible.");Size best=null;double score=Double.MAX_VALUE;
  for(Size s:list){double penalty=Math.abs(s.getWidth()/(double)s.getHeight()-ratio)*1_000_000;if(s.getWidth()>w||s.getHeight()>h)penalty+=2_000_000;penalty+=Math.abs((long)s.getWidth()*s.getHeight()-(long)w*h);if(penalty<score){best=s;score=penalty;}}return best;
 }
 private void transform(int width,int height){if(texture==null||previewSize==null)return;int rotation=getWindowManager().getDefaultDisplay().getRotation();Matrix m=new Matrix();RectF view=new RectF(0,0,width,height),buffer=new RectF(0,0,previewSize.getHeight(),previewSize.getWidth());float cx=view.centerX(),cy=view.centerY();if(rotation==Surface.ROTATION_90||rotation==Surface.ROTATION_270){buffer.offset(cx-buffer.centerX(),cy-buffer.centerY());m.setRectToRect(view,buffer,Matrix.ScaleToFit.FILL);float scale=Math.max(height/(float)previewSize.getHeight(),width/(float)previewSize.getWidth());m.postScale(scale,scale,cx,cy);m.postRotate(90*(rotation-2),cx,cy);}else if(rotation==Surface.ROTATION_180)m.postRotate(180,cx,cy);texture.setTransform(m);}
 private int orientation(){int sensor=chars.get(CameraCharacteristics.SENSOR_ORIENTATION);int rotation=getWindowManager().getDefaultDisplay().getRotation();int degrees=rotation==Surface.ROTATION_90?90:rotation==Surface.ROTATION_180?180:rotation==Surface.ROTATION_270?270:0;return (sensor-degrees+360)%360;}
 private void controls(CaptureRequest.Builder b,boolean video){int[] modes=chars.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES);int preferred=video?CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO:CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE;if(modes!=null)for(int m:modes)if(m==preferred){b.set(CaptureRequest.CONTROL_AF_MODE,preferred);break;}b.set(CaptureRequest.CONTROL_AE_MODE,CaptureRequest.CONTROL_AE_MODE_ON);}
 private void preview(){try{if(camera==null||closing||!texture.isAvailable())return;SurfaceTexture surface=texture.getSurfaceTexture();surface.setDefaultBufferSize(previewSize.getWidth(),previewSize.getHeight());if(preview!=null)preview.release();preview=new Surface(surface);
  CaptureRequest.Builder b=camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);b.addTarget(preview);controls(b,false);
  camera.createCaptureSession(Arrays.asList(preview,reader.getSurface()),new CameraCaptureSession.StateCallback(){public void onConfigured(CameraCaptureSession s){if(camera==null||closing){s.close();return;}session=s;try{s.setRepeatingRequest(b.build(),null,worker);runOnUiThread(()->{transform(texture.getWidth(),texture.getHeight());if(!busy)shutter.setEnabled(true);});}catch(Exception e){runOnUiThread(()->fail(e));}}public void onConfigureFailed(CameraCaptureSession s){runOnUiThread(()->fail(new IOException("No se pudo iniciar la vista de cámara.")));}},worker);
 }catch(Exception e){runOnUiThread(()->fail(e));}}
 private void freezeCapture()throws Exception{JSONObject location=gps();pending.put("capturedAt",RecordStore.now()).put("gps",location==null?JSONObject.NULL:location);store.pending(pending);}
 private void photo()throws Exception{
  busy=true;shutter.setEnabled(false);done.setEnabled(false);info.setText("Guardando fotografía cifrada…");CaptureRequest.Builder b=camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);b.addTarget(reader.getSurface());controls(b,false);b.set(CaptureRequest.JPEG_ORIENTATION,orientation());
  // Timestamp and GPS are frozen for the shutter request, never at upload time.
  freezeCapture();
  session.capture(b.build(),new CameraCaptureSession.CaptureCallback(){public void onCaptureFailed(CameraCaptureSession s,CaptureRequest r,CaptureFailure failure){runOnUiThread(()->fail(new IOException("La cámara no entregó la fotografía. El borrador se conserva.")));}},worker);
 }
 private void image(ImageReader source){Image image=null;try{image=source.acquireNextImage();if(image==null)return;ByteBuffer buf=image.getPlanes()[0].getBuffer();byte[] bytes=new byte[buf.remaining()];buf.get(bytes);JSONObject p=pending;if(p==null)throw new IOException("No se encontró el registro de la toma.");store.importPhoto(p,bytes);pending=null;runOnUiThread(()->{busy=false;Toast.makeText(this,"Fotografía guardada y cifrada",Toast.LENGTH_SHORT).show();setResult(RESULT_OK);finish();});}catch(Exception e){runOnUiThread(()->fail(e));}finally{if(image!=null)image.close();}}
 private void startRecording(){starting=true;busy=true;shutter.setEnabled(false);done.setEnabled(false);info.setText("Preparando grabación…");
  try{if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)throw new IOException("Permite el micrófono para grabar video.");
   raw=Vault.incoming(this,pending.getString("id"));recorder=new MediaRecorder();recorder.setAudioSource(MediaRecorder.AudioSource.MIC);recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);recorder.setOutputFile(raw.getAbsolutePath());recorder.setVideoEncodingBitRate(1_500_000);recorder.setVideoFrameRate(30);recorder.setVideoSize(videoSize.getWidth(),videoSize.getHeight());recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);recorder.setAudioEncodingBitRate(96000);recorder.setAudioSamplingRate(44100);recorder.setMaxDuration(60000);recorder.setMaxFileSize(48L*1024*1024);recorder.setOrientationHint(orientation());recorder.setOnInfoListener((m,what,extra)->{if(what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED||what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED)runOnUiThread(()->stopRecording(false));});recorder.prepare();
   if(session!=null){session.close();session=null;}CaptureRequest.Builder b=camera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD);b.addTarget(preview);b.addTarget(recorder.getSurface());controls(b,true);
   camera.createCaptureSession(Arrays.asList(preview,recorder.getSurface()),new CameraCaptureSession.StateCallback(){public void onConfigured(CameraCaptureSession s){session=s;try{if(closing){recorder.release();recorder=null;return;}s.setRepeatingRequest(b.build(),null,worker);runOnUiThread(()->{try{freezeCapture();recorder.start();startElapsed=SystemClock.elapsedRealtime();recording=true;starting=false;shutter.setEnabled(true);shutter.setText("■ Detener y guardar");done.setEnabled(true);ui.post(timer);}catch(Exception e){fail(e);}});}catch(Exception e){runOnUiThread(()->fail(e));}}public void onConfigureFailed(CameraCaptureSession s){runOnUiThread(()->fail(new IOException("No se pudo iniciar la grabación.")));}},worker);
  }catch(Exception e){starting=false;fail(e);}
 }
 private void stopRecording(boolean background){
  if(!recording)return;recording=false;ui.removeCallbacks(timer);shutter.setEnabled(false);done.setEnabled(false);info.setText("Cifrando y conservando video…");
  try{recorder.stop();recorder.release();recorder=null;JSONObject p=pending;File f=raw;
   worker.post(()->{try{store.importVideo(p,f);if(f.exists())f.delete();pending=null;runOnUiThread(()->{busy=false;Toast.makeText(this,"Video guardado y cifrado",Toast.LENGTH_SHORT).show();setResult(RESULT_OK);finish();});}catch(Exception e){runOnUiThread(()->fail(e));}});
  }catch(Exception e){if(recorder!=null){recorder.release();recorder=null;}fail(new IOException("La grabación se interrumpió. Se conserva el archivo privado para intentar recuperarlo."));}
 }
 private void leave(){if(recording){new AlertDialog.Builder(this).setMessage("¿Detener y conservar la grabación?").setNegativeButton("Seguir grabando",null).setPositiveButton("Guardar video",(d,w)->stopRecording(false)).show();}else if(!busy&&!starting)finish();}
 @Override public void onBackPressed(){leave();}
 private void fail(Exception e){if(isFinishing()||isDestroyed())return;busy=false;starting=false;if(shutter!=null)shutter.setEnabled(false);if(done!=null)done.setEnabled(true);new AlertDialog.Builder(this).setTitle("No se completó la captura").setMessage(e.getMessage()==null?"No se pudo completar la captura. Reabre la app para recuperar el borrador.":e.getMessage()).setPositiveButton("Volver al registro",(d,w)->finish()).show();}
 @Override protected void onPause(){if(recording)stopRecording(true);closing=true;if(locations!=null)locations.removeUpdates(this);if(session!=null){session.close();session=null;}if(camera!=null){camera.close();camera=null;}super.onPause();}
 @Override protected void onDestroy(){if(reader!=null)reader.close();if(preview!=null)preview.release();if(thread!=null)thread.quitSafely();if(recorder!=null){recorder.release();recorder=null;}super.onDestroy();}
}
