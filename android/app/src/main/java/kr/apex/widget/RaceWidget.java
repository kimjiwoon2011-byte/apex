package kr.apex.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * 홈 화면 위젯 — 다음 경기와 남은 시간.
 *
 * 웹 위젯(widget.html)과 같은 races.json 을 받아 같은 규칙으로 다음 경기를 고릅니다.
 * 시:분:초는 Chronometer 가 폰 안에서 1초마다 줄어듭니다. 위젯을 1초마다 다시 그리면
 * 배터리를 먹으므로, 다시 그리는 건 '날수가 바뀌는 순간'과 '경기 시작·끝' 때뿐입니다.
 */
public class RaceWidget extends AppWidgetProvider {

    static final String SRC = "https://apex-five-theta.vercel.app/races.json";
    static final String SITE = "https://apex-five-theta.vercel.app/?tab=cal";
    static final String ACTION_TICK = "kr.apex.widget.TICK";
    static final long HOUR = 3600000L, DAY = 24 * HOUR;
    /* 일정은 자주 안 바뀝니다. 웹 위젯처럼 6시간에 한 번만 받습니다. */
    static final long FETCH_EVERY = 6 * HOUR;

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        work(ctx);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);          /* 위젯 갱신이면 여기서 onUpdate 로 갑니다 */
        String a = intent.getAction();
        if (ACTION_TICK.equals(a) || Intent.ACTION_BOOT_COMPLETED.equals(a)
                || Intent.ACTION_TIME_CHANGED.equals(a) || Intent.ACTION_TIMEZONE_CHANGED.equals(a)) {
            work(ctx);
        }
    }

    @Override
    public void onDisabled(Context ctx) {
        /* 마지막 위젯을 치웠으면 예약해 둔 다시 그리기도 치웁니다 */
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(tickIntent(ctx));
    }

    /* 인터넷은 화면 스레드에서 못 씁니다. 따로 돌리고, 끝날 때까지 기다려 달라고 합니다. */
    private void work(Context ctx) {
        final PendingResult pending = goAsync();
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                drawAll(app);                       /* 저장된 일정으로 먼저 그립니다 */
                if (fetch(app)) drawAll(app);       /* 새 일정을 받았으면 다시 */
            } finally {
                pending.finish();
            }
        }).start();
    }

    static void drawAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m.getAppWidgetIds(new ComponentName(ctx, RaceWidget.class));
        if (ids == null || ids.length == 0) return;
        m.updateAppWidget(ids, build(ctx));
    }

    /* ── 일정 받기 ───────────────────────────────────────────────── */

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("apex", Context.MODE_PRIVATE);
    }

    /** 새로 받았으면 true */
    static boolean fetch(Context ctx) {
        SharedPreferences p = prefs(ctx);
        long now = System.currentTimeMillis();
        if (p.contains("races") && now - p.getLong("fetchedAt", 0) < FETCH_EVERY) return false;
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(SRC + "?t=" + (now / DAY)).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            if (c.getResponseCode() != 200) return false;
            String body = readAll(c.getInputStream());
            JSONArray races = new JSONObject(body).optJSONArray("races");
            if (races == null || races.length() == 0) return false;
            p.edit().putString("races", body).putLong("fetchedAt", now).apply();
            return true;
        } catch (Exception e) {
            return false;                           /* 저장해 둔 걸 그대로 씁니다 */
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /* 받은 게 없으면 앱에 넣어 둔 일정(빌드할 때의 races.json)으로 */
    static JSONObject data(Context ctx) {
        String s = prefs(ctx).getString("races", null);
        if (s == null) {
            try (InputStream in = ctx.getAssets().open("races.json")) {
                s = readAll(in);
            } catch (Exception e) {
                return null;
            }
        }
        try {
            return new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    static String readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    /* ── 그리기 ──────────────────────────────────────────────────── */

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_race);
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(ctx, 0,
                new Intent(Intent.ACTION_VIEW, Uri.parse(SITE)),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

        long now = System.currentTimeMillis();
        JSONObject d = data(ctx);
        JSONArray races = d == null ? null : d.optJSONArray("races");
        if (races == null) {
            schedule(ctx, now + HOUR / 2);          /* 30분 뒤 다시 해 봅니다 */
            return message(v, "일정을 받지 못했어요");
        }

        /* 웹 위젯과 같은 규칙: 끝나지 않은 첫 경기. 진행 중이면 그 경기. */
        JSONObject r = null;
        long start = 0;
        for (int i = 0; i < races.length(); i++) {
            JSONObject x = races.optJSONObject(i);
            if (x == null) continue;
            long ms = parse(x.optString("t"));
            if (ms > 0 && ms + x.optDouble("h", 2) * HOUR > now) { r = x; start = ms; break; }
        }
        if (r == null) return message(v, "이번 시즌 경기가 끝났어요");

        String s = r.optString("s");
        JSONObject series = d.optJSONObject("series");
        JSONObject info = series == null ? null : series.optJSONObject(s);
        v.setImageViewResource(R.id.bg, background(s));
        v.setTextViewText(R.id.tag, info != null ? info.optString("name", s) : s.toUpperCase(Locale.ROOT));
        v.setTextViewText(R.id.round, "라운드 " + r.optInt("r") + " · " + when(start));
        v.setTextViewText(R.id.name, (r.optString("f") + " " + r.optString("n")).trim());
        v.setTextViewText(R.id.circuit, r.optString("c"));
        v.setViewVisibility(R.id.msg, View.GONE);

        long left = start - now;
        if (left <= 0) {
            v.setViewVisibility(R.id.count, View.GONE);
            v.setViewVisibility(R.id.live, View.VISIBLE);
            schedule(ctx, start + (long) (r.optDouble("h", 2) * HOUR));   /* 끝나면 다음 경기로 */
        } else {
            long days = left / DAY;
            long target = start - days * DAY;       /* 날수가 하나 줄어드는 순간 */
            v.setViewVisibility(R.id.live, View.GONE);
            v.setViewVisibility(R.id.count, View.VISIBLE);
            v.setTextViewText(R.id.days, String.valueOf(days));
            v.setChronometer(R.id.clock, SystemClock.elapsedRealtime() + (target - now), null, true);
            v.setChronometerCountDown(R.id.clock, true);
            schedule(ctx, target);                  /* 시계가 0이 되면 날수를 줄여 다시 그립니다 */
        }
        return v;
    }

    static RemoteViews message(RemoteViews v, String text) {
        v.setImageViewResource(R.id.bg, R.drawable.bg_default);
        v.setTextViewText(R.id.tag, "APEX");
        v.setTextViewText(R.id.round, "");
        v.setTextViewText(R.id.name, "");
        v.setTextViewText(R.id.circuit, "");
        v.setViewVisibility(R.id.count, View.GONE);
        v.setViewVisibility(R.id.live, View.GONE);
        v.setViewVisibility(R.id.msg, View.VISIBLE);
        v.setTextViewText(R.id.msg, text);
        return v;
    }

    static int background(String s) {
        switch (s) {
            case "f1": return R.drawable.bg_f1;
            case "wec": return R.drawable.bg_wec;
            case "imsa": return R.drawable.bg_imsa;
            case "dtm": return R.drawable.bg_dtm;
            case "sgt": return R.drawable.bg_sgt;
            case "gt": return R.drawable.bg_gt;
            default: return R.drawable.bg_default;
        }
    }

    /* "2026-09-26T20:00:00+09:00" → 밀리초. 못 읽으면 0 */
    static long parse(String t) {
        try {
            return OffsetDateTime.parse(t).toInstant().toEpochMilli();
        } catch (Exception e) {
            return 0;
        }
    }

    /* 폰의 시간대로 "9/26 (토) 20:00" */
    static String when(long ms) {
        return DateTimeFormatter.ofPattern("M/d (E) HH:mm", Locale.KOREAN)
                .format(Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()));
    }

    /* ── 다시 그리기 예약 ────────────────────────────────────────────
       보통 예약은 안드로이드가 10분까지 늦출 수 있어서, 그동안 시계가 0 아래로
       내려가 보입니다. 달력류 앱에 허용되는 정확한 예약을 쓰고, 안 되면 보통 예약으로. */
    static PendingIntent tickIntent(Context ctx) {
        Intent i = new Intent(ctx, RaceWidget.class).setAction(ACTION_TICK);
        return PendingIntent.getBroadcast(ctx, 1, i,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void schedule(Context ctx, long at) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am == null) return;
        PendingIntent pi = tickIntent(ctx);
        long when = at + 1000;                      /* 0초를 확실히 넘긴 뒤에 */
        boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
        try {
            if (exact) am.setExact(AlarmManager.RTC, when, pi);
            else am.setWindow(AlarmManager.RTC, when, 60000L, pi);
        } catch (SecurityException e) {
            am.setWindow(AlarmManager.RTC, when, 60000L, pi);
        }
    }
}
