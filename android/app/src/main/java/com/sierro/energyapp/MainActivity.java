package com.sierro.energyapp;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
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
