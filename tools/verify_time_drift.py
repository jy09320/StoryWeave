#!/usr/bin/env python3
"""
增强版时间对齐验证 - 检测时间漂移
除了检查起始对齐，还会检查：
1. 结束时刻的同步性
2. 中间采样点的时间分布
3. 可能的时钟漂移
"""

import sys
import os
import json
import h5py
import pandas as pd
import numpy as np
from pathlib import Path


def verify_time_drift(record_dir: str, sample_points: int = 10):
    """
    验证录制目录中的时间漂移
    
    Args:
        record_dir: 录制目录路径
        sample_points: 在时间轴上采样的点数
    """
    record_path = Path(record_dir)
    
    print(f"🔍 验证录制目录: {record_path.name}")
    print("=" * 80)
    
    # 1. 读取基础信息
    task_info_path = record_path / "metadata" / "task_info.json"
    if not task_info_path.exists():
        print(f"❌ 未找到 {task_info_path}")
        return False
    
    with open(task_info_path, "r") as f:
        task_info = json.load(f)
    
    global_start_time = task_info.get("start_time")
    print(f"\n📋 任务信息:")
    print(f"  - Task ID: {task_info.get('task_id')}")
    print(f"  - Global Start Time: {global_start_time}")
    
    # 2. 读取 frames.csv
    frames_csv_path = record_path / "frames.csv"
    if not frames_csv_path.exists():
        print(f"❌ 未找到 {frames_csv_path}")
        return False
    
    df = pd.read_csv(frames_csv_path)
    
    # 3. 读取 pose.h5
    pose_h5_path = record_path / "pose.h5"
    if not pose_h5_path.exists():
        print(f"\n⚠️  未找到 pose.h5，无法检测漂移")
        return None
    
    print(f"\n" + "=" * 80)
    print(f"⏱️  时间同步分析")
    print("=" * 80)
    
    # 4. 获取相机和pose的时间范围
    camera_times = {
        'start': df['timestamp'].min(),
        'end': df['timestamp'].max(),
        'duration': df['timestamp'].max() - df['timestamp'].min(),
    }
    
    with h5py.File(pose_h5_path, "r") as f:
        # 检查 start_time 属性
        if "start_time" not in f.attrs:
            print(f"  ⚠️  pose.h5 没有 start_time 属性（旧版本格式）")
            return False
        
        pose_start_time = f.attrs["start_time"]
        
        # 找到所有 _timestamp_recv 数据集
        pose_timestamps = []
        pose_datasets = []
        
        for key in f.keys():
            ts_key = f"{key}_timestamp_recv"
            if ts_key in f:
                timestamps = f[ts_key][:]
                pose_timestamps.extend(timestamps)
                pose_datasets.append((key, timestamps))
        
        if not pose_timestamps:
            print(f"  ⚠️  pose.h5 中没有时间戳数据")
            return False
        
        pose_timestamps = np.array(pose_timestamps)
        pose_times = {
            'start': pose_timestamps.min(),
            'end': pose_timestamps.max(),
            'duration': pose_timestamps.max() - pose_timestamps.min(),
        }
    
    # 5. 检查起始对齐
    print(f"\n📍 起始时刻对齐:")
    start_offset = camera_times['start'] - pose_times['start']
    start_status = "✅" if abs(start_offset) < 0.1 else "❌"
    print(f"  {start_status} Camera 第一帧: {camera_times['start']:.6f}s")
    print(f"  {start_status} Pose 第一个样本: {pose_times['start']:.6f}s")
    print(f"  {start_status} 起始偏移: {start_offset:.6f}s ({abs(start_offset)*1000:.2f}ms)")
    
    # 6. 检查结束时刻对齐
    print(f"\n📍 结束时刻对齐:")
    end_offset = camera_times['end'] - pose_times['end']
    end_status = "✅" if abs(end_offset) < 0.1 else "❌"
    print(f"  {end_status} Camera 最后一帧: {camera_times['end']:.6f}s")
    print(f"  {end_status} Pose 最后样本: {pose_times['end']:.6f}s")
    print(f"  {end_status} 结束偏移: {end_offset:.6f}s ({abs(end_offset)*1000:.2f}ms)")
    
    # 7. 计算漂移率
    print(f"\n⏱️  时钟漂移分析:")
    duration = camera_times['duration']
    drift = end_offset - start_offset
    drift_rate = (drift / duration) * 1000 if duration > 0 else 0  # ms/s
    
    print(f"  - 录制时长: {duration:.3f}s")
    print(f"  - 累积漂移: {drift:.6f}s ({abs(drift)*1000:.2f}ms)")
    print(f"  - 漂移率: {drift_rate:.4f} ms/s")
    
    drift_status = "✅"
    if abs(drift_rate) > 1.0:
        drift_status = "❌"
        drift_level = "严重"
    elif abs(drift_rate) > 0.1:
        drift_status = "⚠️"
        drift_level = "轻微"
    else:
        drift_level = "可忽略"
    
    print(f"  {drift_status} 漂移程度: {drift_level}")
    
    # 8. 采样点分析
    print(f"\n📊 时间轴采样分析（{sample_points}个采样点）:")
    
    # 在camera时间轴上等间隔采样
    sample_times = np.linspace(camera_times['start'], camera_times['end'], sample_points)
    
    print(f"  {'时刻(s)':<10} {'Camera帧数':<12} {'Pose样本数':<12} {'比率':<10}")
    print(f"  {'-'*50}")
    
    for t in sample_times:
        # 统计在这个时刻之前的camera帧数
        cam_count = len(df[df['timestamp'] <= t])
        
        # 统计在这个时刻之前的pose样本数
        pose_count = len(pose_timestamps[pose_timestamps <= t])
        
        ratio = pose_count / cam_count if cam_count > 0 else 0
        
        print(f"  {t:<10.3f} {cam_count:<12} {pose_count:<12} {ratio:<10.2f}")
    
    # 9. 检查各个pose数据集的覆盖范围
    print(f"\n📊 Pose 数据集覆盖范围:")
    with h5py.File(pose_h5_path, "r") as f:
        for key, timestamps in pose_datasets:
            coverage_start = (timestamps.min() - camera_times['start'])
            coverage_end = (camera_times['end'] - timestamps.max())
            
            status = "✅"
            if coverage_start > 0.5 or coverage_end > 0.5:
                status = "⚠️"
            
            print(f"  {status} {key}:")
            print(f"      范围: {timestamps.min():.3f}s ~ {timestamps.max():.3f}s")
            print(f"      覆盖: 晚开始 {coverage_start:.3f}s, 早结束 {coverage_end:.3f}s")
    
    # 10. 总结
    print(f"\n" + "=" * 80)
    print(f"📊 时间漂移验证结果:")
    
    issues = []
    
    if abs(start_offset) >= 0.1:
        issues.append(f"起始偏移过大: {abs(start_offset)*1000:.2f}ms")
    
    if abs(end_offset) >= 0.1:
        issues.append(f"结束偏移过大: {abs(end_offset)*1000:.2f}ms")
    
    if abs(drift_rate) > 1.0:
        issues.append(f"时钟漂移严重: {drift_rate:.4f} ms/s")
    elif abs(drift_rate) > 0.1:
        issues.append(f"检测到轻微时钟漂移: {drift_rate:.4f} ms/s")
    
    if not issues:
        print(f"  ✅ 未检测到明显的时间漂移")
        print(f"  ✅ Camera 和 Pose 时间轴保持良好同步")
        return True
    else:
        print(f"  ⚠️  检测到以下问题:")
        for issue in issues:
            print(f"     - {issue}")
        
        if abs(drift_rate) > 1.0:
            print(f"\n  💡 建议:")
            print(f"     - 检查系统时钟是否稳定（NTP同步）")
            print(f"     - 检查CPU负载是否过高导致时间戳记录延迟")
            print(f"     - 考虑使用硬件同步信号")
        
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python verify_time_drift.py <录制目录> [采样点数]")
        print("示例: python verify_time_drift.py backend/records/1_20260116052245 10")
        sys.exit(1)
    
    record_dir = sys.argv[1]
    sample_points = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    
    success = verify_time_drift(record_dir, sample_points)
    sys.exit(0 if success else 1)
