package io.github.jung2550563.codebeat;

import android.content.Context;
import android.content.pm.PackageInfo;

final class BuildConfigHolder {
    private BuildConfigHolder() { }

    static String versionName(Context c) {
        try {
            PackageInfo p = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return p.versionName == null ? "0" : p.versionName;
        } catch (Exception e) {
            return "0";
        }
    }
}
