package io.github.onedhairyak.lyricconstellation;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/** Full-screen Constellation lyrics: ui/index.html served from the app's assets, with android.js behind it. */
public class MainActivity extends Activity {
    private static final String HOME = "https://appassets.androidplatform.net/assets/ui/index.html";
    private WebView web;
    private boolean asked;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);   // lyrics shouldn't sleep mid-song
        if (Build.VERSION.SDK_INT >= 28) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        // https origin for the assets, so fonts load and LRCLIB / iTunes answer like they do for a web page
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web = new WebView(this);
        web.setBackgroundColor(0xFF000000);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);   // lyrics cache and the chosen color
        web.addJavascriptInterface(new Media(this), "Media");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return assets.shouldInterceptRequest(r.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (r.getUrl().toString().startsWith("https://appassets.androidplatform.net/")) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl()));   // any other link opens in the browser
                return true;
            }
        });
        setContentView(web);
        web.loadUrl(HOME);
    }

    @Override
    protected void onResume() {
        super.onResume();
        immersive();
        web.onResume();
        if (!Media.granted(this) && !asked) {
            asked = true;
            new AlertDialog.Builder(this)
                    .setTitle("See what's playing")
                    .setMessage("To show lyrics for Spotify, YouTube Music and other players, allow Lyric Constellation "
                            + "notification access on the next screen. It only reads what song is playing; notifications are never read.")
                    .setPositiveButton("Allow", (d, w) -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)))
                    .setNegativeButton("Not now", null)
                    .show();
        }
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) immersive();
    }

    private void immersive() {   // hide the status and navigation bars; a swipe from the edge shows them briefly
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }
}
