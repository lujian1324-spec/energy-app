package com.sierro.energyapp;

import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be called before super.onCreate()/setContentView(). Without this call the
        // androidx.core:core-splashscreen dependency (already in build.gradle) never actually
        // takes effect: on Android 12+ (API 31+) AppTheme.NoActionBarLaunch's parent
        // (Theme.SplashScreen) is the REAL system splash-screen theme, and without installing
        // the compat SplashScreen the OS falls back to its own default template — the app's
        // small adaptive-icon foreground (max 432x432, sized for a ~48dp launcher icon) scaled
        // up to fill the splash screen, instead of the properly-sized full-bleed
        // drawable/splash.png this app already ships per density. That's the low-res/pixelated
        // "Sierro logo" users see on launch. Installing it here makes android:background take
        // over as intended on every API level.
        SplashScreen.installSplashScreen(this);
        // After the splash screen dismisses, switch the Activity theme from
        // NoActionBarLaunch (which has android:background="@drawable/splash" —
        // the Sierro wordmark) to NoActionBar (which uses the dark #141414
        // appBackground).  If we don't do this, the splash drawable stays as
        // the window background forever; normally it's hidden behind the
        // opaque WebView, but when the soft keyboard appears KeyboardResize.Body
        // shrinks the WebView and the splash image becomes visible — that's
        // the "large Sierro logo takes over the screen" bug on Android.
        setTheme(R.style.AppTheme_NoActionBar);
        // Android 15+ (targetSdk 35+) draws edge-to-edge by default. Calling
        // EdgeToEdge.enable() makes that behavior consistent on older APIs and
        // avoids relying on the deprecated Window.setStatusBarColor /
        // setNavigationBarColor APIs that Play Console flagged.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        // Belt-and-suspenders for the same bug: force the window background to the dark
        // app color programmatically, so no @drawable/splash can ever be revealed behind
        // the WebView when KeyboardResize.Body shrinks it — independent of theme timing.
        getWindow().setBackgroundDrawable(new ColorDrawable(0xFF141414));
        // Light icons on our dark #141414 chrome (replaces theme statusBarColor /
        // navigationBarColor, which are deprecated on Android 15).
        WindowInsetsControllerCompat insetsController =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(false);
            insetsController.setAppearanceLightNavigationBars(false);
        }
        // Pad the WebView for system bars so content is not drawn under the
        // status / navigation bars after going edge-to-edge.
        View webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);
        // Android's Autofill Framework (API 26+) shows a branded suggestion strip / overlay
        // above the keyboard (with this app's launcher icon) whenever the WebView detects a
        // login-style form (username/password/verification-code fields) — the "logo above the
        // keyboard" on Login/Register/Forgot Password. IMPORTANT_FOR_AUTOFILL_NO alone only
        // opts out the WebView view itself, NOT its virtual children (the HTML inputs), so the
        // strip could still appear; NO_EXCLUDE_DESCENDANTS opts out the whole subtree. Apply it
        // to the decor view too so the entire window is excluded from the Autofill Framework.
        // (The IME's own password-manager suggestions, driven by the inputs' autocomplete
        // attributes, are a separate mechanism and are unaffected.)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            int noAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS;
            webView.setImportantForAutofill(noAutofill);
            getWindow().getDecorView().setImportantForAutofill(noAutofill);
        }
    }
}
