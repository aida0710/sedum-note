package com.github.aida0710.sedumnote

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

// ホーム画面のウィジェット。押すとアプリを開いて、新しいメモを作る。
// メモはロックを解除するまで読めないので、ウィジェットにメモの中身は出さない。
class NewNoteWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    val openNewNote = PendingIntent.getActivity(
      context,
      0,
      Intent(context, MainActivity::class.java).setAction(ACTION_NEW_NOTE),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    for (appWidgetId in appWidgetIds) {
      val views = RemoteViews(context.packageName, R.layout.new_note_widget)
      views.setOnClickPendingIntent(R.id.new_note_widget_button, openNewNote)
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }
}
