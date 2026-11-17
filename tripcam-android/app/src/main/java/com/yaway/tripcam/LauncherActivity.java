package com.yaway.tripcam;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;

/** One app for both devices: on the watch it shows the trippy feed, on the phone it's the camera. */
public class LauncherActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        boolean watch = getPackageManager().hasSystemFeature(PackageManager.FEATURE_WATCH);
        startActivity(new Intent(this, watch ? WatchActivity.class : PhoneActivity.class));
        finish();
    }
}
