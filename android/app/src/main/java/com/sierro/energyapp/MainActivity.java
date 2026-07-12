package com.sierro.energyapp;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import androidx.core.splashscreen.SplashScreen;
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
        super.onCreate(savedInstanceState);
        // Android's Autofill Framework (API 26+) shows a small suggestion strip above the
        // keyboard branded with this app's launcher icon whenever the WebView detects a
        // login-style form (username/password/verification-code fields) — that's the
        // "Sierro logo above the keyboard" users see on Login/Register/Forgot Password.
        // Opting the WebView out of autofill importance suppresses that OS-level UI.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getBridge().getWebView().setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        }
    }
}
