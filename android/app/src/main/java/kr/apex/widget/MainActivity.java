package kr.apex.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * 앱 아이콘을 누르면 나오는 화면. 위젯을 홈 화면에 놓는 버튼과, APEX 를 여는 버튼뿐입니다.
 * 위젯이 본체라 화면은 이것만 있으면 됩니다.
 */
public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_VERTICAL);
        root.setFitsSystemWindows(true);            /* 상태 표시줄 밑으로 글자가 숨지 않게 */
        root.setBackgroundColor(0xFF0B1424);
        int pad = dp(28);
        root.setPadding(pad, pad, pad, pad);

        TextView title = text("APEX 위젯", 28, 0xFFFFFFFF);
        title.setTypeface(Typeface.create("sans-serif-black", Typeface.NORMAL));
        root.addView(title);

        TextView body = text("앱을 열지 않아도 홈 화면에서 다음 경기와 남은 시간을 바로 봅니다.\n\n"
                + "아래 버튼을 누르거나, 홈 화면 빈 곳을 길게 눌러 위젯 → APEX 를 고르세요.", 15, 0xCCFFFFFF);
        body.setPadding(0, dp(12), 0, dp(28));
        body.setLineSpacing(0, 1.35f);
        root.addView(body);

        Button add = new Button(this);
        add.setText("홈 화면에 위젯 놓기");
        add.setOnClickListener(x -> pin());
        root.addView(add);

        Button open = new Button(this);
        open.setText("APEX 열기");
        open.setOnClickListener(x ->
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(RaceWidget.SITE))));
        root.addView(open);

        setContentView(root);

        /* 이미 놓아 둔 위젯이 있으면 이 김에 새로 그립니다 */
        sendBroadcast(new Intent(this, RaceWidget.class).setAction(RaceWidget.ACTION_TICK));
    }

    private void pin() {
        AppWidgetManager m = getSystemService(AppWidgetManager.class);
        if (m != null && m.isRequestPinAppWidgetSupported()) {
            m.requestPinAppWidget(new ComponentName(this, RaceWidget.class), null, null);
        } else {
            Toast.makeText(this, "홈 화면 빈 곳을 길게 눌러 위젯 → APEX 를 골라 주세요",
                    Toast.LENGTH_LONG).show();
        }
    }

    private TextView text(String s, int sp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        return t;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
