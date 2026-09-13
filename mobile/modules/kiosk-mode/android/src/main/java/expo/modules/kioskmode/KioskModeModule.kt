package expo.modules.kioskmode

import android.app.ActivityManager
import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KioskModeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KioskMode")

    Function("startKioskMode") {
      val activity = appContext.currentActivity ?: return@Function null
      try {
        activity.startLockTask()
      } catch (e: Exception) {
        // Swallowed deliberately - throws if already pinned, or if some
        // OEM Android build refuses app-invoked lock task entirely.
      }
    }

    Function("stopKioskMode") {
      val activity = appContext.currentActivity ?: return@Function null
      try {
        activity.stopLockTask()
      } catch (e: Exception) {
        // Throws IllegalStateException if not actually pinned - ignore.
      }
    }

    Function("isInKioskMode") {
      val activity = appContext.currentActivity ?: return@Function false
      return@Function try {
        val am = activity.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
      } catch (e: Exception) {
        false
      }
    }
  }
}