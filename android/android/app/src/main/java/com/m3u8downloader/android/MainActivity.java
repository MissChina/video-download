package com.m3u8downloader.android;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.widget.Toast;
import android.app.AlertDialog;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

/**
 * MainActivity - M3U8 下载器
 * 版本：4.0.1-beta
 *
 * 主要功能：
 * 1. 在应用启动时立即请求必要的系统权限
 * 2. 提供详细的日志输出用于调试
 * 3. 向用户展示友好的权限说明
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "M3U8Downloader";
    private static final int PERMISSION_REQUEST_CODE = 10001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Log.i(TAG, "==============================================");
        Log.i(TAG, "M3U8 下载器 v4.0.1-beta 启动");
        Log.i(TAG, "Android 版本: " + Build.VERSION.SDK_INT + " (" + Build.VERSION.RELEASE + ")");
        Log.i(TAG, "设备型号: " + Build.MANUFACTURER + " " + Build.MODEL);
        Log.i(TAG, "包名: " + getPackageName());
        Log.i(TAG, "==============================================");

        // 立即显示启动提示
        Toast.makeText(this, "M3U8下载器 v4.0.1-beta 初始化中...", Toast.LENGTH_SHORT).show();

        // 检查并请求权限
        checkAndRequestPermissions();
    }

    /**
     * 检查并请求必要的权限
     */
    private void checkAndRequestPermissions() {
        Log.i(TAG, ">>> 开始权限检查流程");

        List<String> permissionsToRequest = new ArrayList<>();

        // Android 6.0 - 12 (API 23-32): 需要存储权限
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            Log.i(TAG, "系统版本: Android 6-12 (API " + Build.VERSION.SDK_INT + ")");
            Log.i(TAG, "需要请求: READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE");

            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.READ_EXTERNAL_STORAGE);
                Log.w(TAG, "  ❌ 缺少: READ_EXTERNAL_STORAGE");
            } else {
                Log.i(TAG, "  ✓ 已有: READ_EXTERNAL_STORAGE");
            }

            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
                Log.w(TAG, "  ❌ 缺少: WRITE_EXTERNAL_STORAGE");
            } else {
                Log.i(TAG, "  ✓ 已有: WRITE_EXTERNAL_STORAGE");
            }
        }
        // Android 13+ (API 33+): 不需要存储权限（Scoped Storage）
        else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Log.i(TAG, "系统版本: Android 13+ (API " + Build.VERSION.SDK_INT + ")");
            Log.i(TAG, "使用 Scoped Storage，无需存储权限");
        }
        // Android 5.x及以下: 权限在安装时自动授予
        else {
            Log.i(TAG, "系统版本: Android 5.x或更低 (API " + Build.VERSION.SDK_INT + ")");
            Log.i(TAG, "权限已在安装时授予");
        }

        // 检查网络权限（这些是正常权限，不需要运行时请求，但可以验证）
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.INTERNET)
                == PackageManager.PERMISSION_GRANTED) {
            Log.i(TAG, "  ✓ 已有: INTERNET");
        } else {
            Log.e(TAG, "  ❌ 异常：缺少 INTERNET 权限（应该在Manifest中自动授予）");
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_NETWORK_STATE)
                == PackageManager.PERMISSION_GRANTED) {
            Log.i(TAG, "  ✓ 已有: ACCESS_NETWORK_STATE");
        }

        // 如果有需要请求的权限
        if (!permissionsToRequest.isEmpty()) {
            Log.w(TAG, ">>> 需要请求 " + permissionsToRequest.size() + " 个权限");
            Log.w(TAG, "权限列表: " + permissionsToRequest.toString());

            // 显示权限说明对话框
            showPermissionRationaleDialog(permissionsToRequest);
        } else {
            Log.i(TAG, ">>> 所有必要权限已就绪");
            onPermissionsGranted();
        }
    }

    /**
     * 显示权限说明对话框
     */
    private void showPermissionRationaleDialog(final List<String> permissions) {
        Log.i(TAG, "显示权限说明对话框");

        new AlertDialog.Builder(this)
            .setTitle("需要存储权限")
            .setMessage("M3U8下载器需要访问设备存储来保存下载的视频文件。\n\n" +
                       "点击「允许」后，系统会弹出权限请求对话框，请选择「允许」以继续使用。\n\n" +
                       "如果拒绝权限，应用将无法保存下载的视频。")
            .setPositiveButton("允许", (dialog, which) -> {
                Log.i(TAG, "用户点击「允许」，准备请求系统权限");
                requestSystemPermissions(permissions);
            })
            .setNegativeButton("拒绝", (dialog, which) -> {
                Log.w(TAG, "用户点击「拒绝」，权限未授予");
                Toast.makeText(this, "权限被拒绝，应用功能将受限", Toast.LENGTH_LONG).show();
                onPermissionsDenied();
            })
            .setCancelable(false)
            .show();
    }

    /**
     * 请求系统级权限（会弹出系统权限对话框）
     */
    private void requestSystemPermissions(List<String> permissions) {
        String[] permissionsArray = permissions.toArray(new String[0]);

        Log.i(TAG, ">>> 调用系统权限请求");
        Log.i(TAG, "权限数量: " + permissionsArray.length);
        for (String perm : permissionsArray) {
            Log.i(TAG, "  - " + perm);
        }

        // 这里会触发系统级权限对话框
        ActivityCompat.requestPermissions(this, permissionsArray, PERMISSION_REQUEST_CODE);
    }

    /**
     * 系统权限请求结果回调
     */
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        Log.i(TAG, "==============================================");
        Log.i(TAG, "系统权限请求结果回调");
        Log.i(TAG, "RequestCode: " + requestCode);
        Log.i(TAG, "==============================================");

        if (requestCode == PERMISSION_REQUEST_CODE) {
            int grantedCount = 0;
            int deniedCount = 0;
            List<String> deniedPermissions = new ArrayList<>();

            for (int i = 0; i < permissions.length; i++) {
                String permission = permissions[i];
                int result = grantResults[i];

                if (result == PackageManager.PERMISSION_GRANTED) {
                    grantedCount++;
                    Log.i(TAG, "✓ 已授予: " + permission);
                } else {
                    deniedCount++;
                    deniedPermissions.add(permission);
                    Log.w(TAG, "✗ 被拒绝: " + permission);
                }
            }

            Log.i(TAG, "统计: 授予 " + grantedCount + " 个，拒绝 " + deniedCount + " 个");

            if (deniedCount > 0) {
                // 有权限被拒绝
                showPermissionDeniedDialog(deniedPermissions);
            } else {
                // 所有权限都被授予
                onPermissionsGranted();
            }
        } else {
            Log.w(TAG, "未知的RequestCode: " + requestCode);
        }
    }

    /**
     * 显示权限被拒绝的提示
     */
    private void showPermissionDeniedDialog(List<String> deniedPermissions) {
        StringBuilder message = new StringBuilder("以下权限被拒绝，部分功能将无法使用：\n\n");
        for (String perm : deniedPermissions) {
            String permName = perm.substring(perm.lastIndexOf('.') + 1);
            message.append("• ").append(permName).append("\n");
        }
        message.append("\n您可以在系统设置中手动授予权限：\n");
        message.append("设置 → 应用 → M3U8下载器 → 权限");

        new AlertDialog.Builder(this)
            .setTitle("权限被拒绝")
            .setMessage(message.toString())
            .setPositiveButton("我知道了", (dialog, which) -> {
                onPermissionsDenied();
            })
            .setCancelable(false)
            .show();

        Toast.makeText(this, "⚠️ 部分权限被拒绝，功能受限", Toast.LENGTH_LONG).show();
    }

    /**
     * 所有权限授予后的回调
     */
    private void onPermissionsGranted() {
        Log.i(TAG, ">>> 权限检查完成：所有必要权限已授予");
        Toast.makeText(this, "✓ 权限已就绪，应用可以正常使用", Toast.LENGTH_SHORT).show();

        // 这里可以添加权限授予后的初始化逻辑
        // 例如：通知WebView权限已就绪
        runOnUiThread(() -> {
            try {
                // 通过Capacitor Bridge发送权限就绪事件
                getBridge().triggerWindowJSEvent("permissionsGranted", "{}");
                Log.i(TAG, "已发送 permissionsGranted 事件到WebView");
            } catch (Exception e) {
                Log.e(TAG, "发送权限事件失败", e);
            }
        });
    }

    /**
     * 权限被拒绝后的回调
     */
    private void onPermissionsDenied() {
        Log.w(TAG, ">>> 权限检查完成：部分权限被拒绝");

        // 通知WebView权限被拒绝
        runOnUiThread(() -> {
            try {
                getBridge().triggerWindowJSEvent("permissionsDenied", "{}");
                Log.i(TAG, "已发送 permissionsDenied 事件到WebView");
            } catch (Exception e) {
                Log.e(TAG, "发送权限事件失败", e);
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        Log.i(TAG, "Activity onResume");
    }

    @Override
    public void onPause() {
        super.onPause();
        Log.i(TAG, "Activity onPause");
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.i(TAG, "Activity onDestroy");
    }
}
