package com.controlpublicidad.app;
import android.app.Activity;import android.graphics.Color;import android.graphics.Insets;import android.graphics.Typeface;import android.graphics.drawable.GradientDrawable;import android.os.Build;import android.view.*;import android.widget.*;
public final class Ui {
 public static final int GREEN=Color.rgb(18,113,91),INK=Color.rgb(31,48,43),MUTED=Color.rgb(96,113,106),BG=Color.rgb(245,247,245),LINE=Color.rgb(221,231,224);
 public static int dp(Activity a,int n){return Math.round(n*a.getResources().getDisplayMetrics().density);}
 public static LinearLayout column(Activity a){LinearLayout v=new LinearLayout(a);v.setOrientation(LinearLayout.VERTICAL);return v;}
 public static LinearLayout row(Activity a){LinearLayout v=new LinearLayout(a);v.setOrientation(LinearLayout.HORIZONTAL);v.setGravity(Gravity.CENTER_VERTICAL);return v;}
 public static GradientDrawable shape(int color,int radius,int stroke){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(radius);if(stroke!=0)d.setStroke(1,stroke);return d;}
 public static TextView text(Activity a,String value,int size,int color){TextView t=new TextView(a);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setPadding(0,dp(a,4),0,dp(a,4));return t;}
 public static TextView title(Activity a,String value){TextView t=text(a,value,23,INK);t.setTypeface(null,Typeface.BOLD);return t;}
 public static Button button(Activity a,String text,Runnable action){Button b=new Button(a);b.setText(text);b.setAllCaps(false);b.setTextSize(14);b.setTextColor(Color.WHITE);b.setBackground(shape(GREEN,dp(a,12),0));b.setMinHeight(dp(a,48));b.setPadding(dp(a,12),dp(a,10),dp(a,12),dp(a,10));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,dp(a,5),0,dp(a,5));b.setLayoutParams(p);b.setOnClickListener(v->action.run());return b;}
 public static void secondary(Activity a,Button b){b.setTextColor(GREEN);b.setBackground(shape(Color.WHITE,dp(a,12),LINE));}
 public static LinearLayout card(Activity a){LinearLayout c=column(a);c.setPadding(dp(a,16),dp(a,12),dp(a,16),dp(a,12));c.setBackground(shape(Color.WHITE,dp(a,16),LINE));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,dp(a,7),0,dp(a,7));c.setLayoutParams(p);return c;}
 public static void root(Activity a,LinearLayout root){root.setBackgroundColor(BG);root.setOnApplyWindowInsetsListener((v,w)->{if(Build.VERSION.SDK_INT>=30){Insets i=w.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(i.left,i.top,i.right,i.bottom);}else v.setPadding(w.getSystemWindowInsetLeft(),w.getSystemWindowInsetTop(),w.getSystemWindowInsetRight(),w.getSystemWindowInsetBottom());return w;});a.setContentView(root);root.requestApplyInsets();}
 public static EditText input(Activity a,String hint){EditText e=new EditText(a);e.setHint(hint);e.setTextSize(16);e.setTextColor(INK);e.setPadding(dp(a,10),dp(a,10),dp(a,10),dp(a,10));return e;}
}
