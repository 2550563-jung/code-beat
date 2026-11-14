package io.github.jung2550563.codebeat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Game notifications for the Android app.
 * Web push doesn't work inside a WebView, so the app asks the code-beat server for new notifications
 * every 15 minutes (the shortest Android allows) and shows them itself.
 */
public class PushJob extends JobService {
    static final String PREFS = "code-beat-push";
    static final String CHANNEL = "code-beat";
    private static final int JOB_PERIODIC = 7101;
    private static final int JOB_NOW = 7102;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, MODE_PRIVATE); }

    static void enable(Context c, String device, String url, String key) {
        prefs(c).edit().putString("device", device).putString("url", url).putString("key", key).putBoolean("on", true).apply();
        createChannel(c);
        JobScheduler js = (JobScheduler) c.getSystemService(JOB_SCHEDULER_SERVICE);
        ComponentName cn = new ComponentName(c, PushJob.class);
        js.schedule(new JobInfo.Builder(JOB_PERIODIC, cn)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true)
                .build());
        pollSoon(c);
    }

    static void pollSoon(Context c) {
        if (!prefs(c).getBoolean("on", false)) return;
        JobScheduler js = (JobScheduler) c.getSystemService(JOB_SCHEDULER_SERVICE);
        js.schedule(new JobInfo.Builder(JOB_NOW, new ComponentName(c, PushJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setMinimumLatency(1000)
                .setOverrideDeadline(60 * 1000)
                .build());
    }

    static void disable(Context c) {
        prefs(c).edit().putBoolean("on", false).apply();
        JobScheduler js = (JobScheduler) c.getSystemService(JOB_SCHEDULER_SERVICE);
        js.cancel(JOB_PERIODIC);
        js.cancel(JOB_NOW);
    }

    static void createChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "code-beat 알림", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("업데이트, 친구 선물·도전, 출석, 토너먼트, 공지");
        ((NotificationManager) c.getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try { poll(getApplicationContext()); } catch (Exception ignored) { }
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return true; }

    static void poll(Context c) throws Exception {
        SharedPreferences p = prefs(c);
        if (!p.getBoolean("on", false)) return;
        String device = p.getString("device", ""), url = p.getString("url", ""), key = p.getString("key", "");
        if (device.isEmpty() || !url.startsWith("https://")) return;
        HttpURLConnection con = (HttpURLConnection) new URL(url + "/rest/v1/rpc/bb_app_push_poll").openConnection();
        con.setRequestMethod("POST");
        con.setConnectTimeout(10000);
        con.setReadTimeout(10000);
        con.setDoOutput(true);
        con.setRequestProperty("apikey", key);
        con.setRequestProperty("Content-Type", "application/json");
        JSONObject body = new JSONObject();
        body.put("p_device", device);
        try (OutputStream os = con.getOutputStream()) { os.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        if (con.getResponseCode() != 200) return;
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(con.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
        }
        JSONArray items = new JSONObject(sb.toString()).optJSONArray("items");
        if (items == null) return;
        createChannel(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 24 && !nm.areNotificationsEnabled()) return;
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.getJSONObject(i);
            String cat = it.optString("cat", "");
            Intent open = new Intent(c, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            open.putExtra("from", "social".equals(cat) ? "push-inbox" : "push");
            int id = (int) (System.currentTimeMillis() % 100000) + i;
            PendingIntent pi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
            b.setSmallIcon(R.drawable.ic_stat_note)
                    .setContentTitle(it.optString("title", "code-beat"))
                    .setContentText(it.optString("body", ""))
                    .setStyle(new Notification.BigTextStyle().bigText(it.optString("body", "")))
                    .setContentIntent(pi)
                    .setAutoCancel(true);
            nm.notify(it.optString("tag", "cb"), id, b.build());
        }
    }
}
