#!/usr/bin/env python3
"""
验证录制数据的时间对齐
检查 frames.csv 和 pose.h5 的时间戳是否从同一起点开始
"""

import sys
import os
import json
import h5py
import pandas as pd
from pathlib import Path


def verify_time_alignment(record_dir: str):
    """
    验证录制目录中的时间对齐
    
    Args:
        record_dir: 录制目录路径（包含 frames.csv, pose.h5, metadata/）
    """
    record_path = Path(record_dir)
    
    print(f"🔍 验证录制目录: {record_path.name}")
    print("=" * 80)
    
    # 1. 读取 task_info.json 中的全局 start_time
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
    
    # 2. 检查相机 metadata
    print(f"\n📷 相机时间轴:")
    metadata_dir = record_path / "metadata"
    camera_aligned = True
    
    for cam_meta_file in metadata_dir.glob("cam*.json"):
        with open(cam_meta_file, "r") as f:
            cam_meta = json.load(f)
        
        cam_name = cam_meta.get("camera_name")
        cam_start = cam_meta.get("start_ts_wall")
        
        offset = cam_start - global_start_time if cam_start and global_start_time else None
        status = "✅" if abs(offset) < 0.001 else "❌"
        
        print(f"  {status} {cam_name}: start_ts_wall={cam_start}, offset={offset:.6f}s")
        
        if abs(offset) >= 0.001:
            camera_aligned = False
    
    # 3. 检查 frames.csv
    frames_csv_path = record_path / "frames.csv"
    if not frames_csv_path.exists():
        print(f"❌ 未找到 {frames_csv_path}")
        return False
    
    df = pd.read_csv(frames_csv_path)
    
    print(f"\n🎞️  Frames.csv:")
    print(f"  - 总帧数: {len(df)}")
    print(f"  - 时间范围: {df['timestamp'].min():.3f}s ~ {df['timestamp'].max():.3f}s")
    print(f"  - 相机列表: {df['camera_name'].unique().tolist()}")
    
    # 检查每个相机的第一帧时间
    for cam_name in df['camera_name'].unique():
        cam_df = df[df['camera_name'] == cam_name]
        first_ts = cam_df['timestamp'].iloc[0]
        print(f"  - {cam_name} 第一帧时间: {first_ts:.6f}s")
    
    # 4. 检查 pose.h5
    pose_h5_path = record_path / "pose.h5"
    pose_aligned = True
    
    if pose_h5_path.exists():
        print(f"\n🤖 Pose.h5:")
        
        with h5py.File(pose_h5_path, "r") as f:
            # 检查是否有 start_time 属性
            if "start_time" in f.attrs:
                pose_start_time = f.attrs["start_time"]
                time_format = f.attrs.get("time_format", "unknown")
                
                offset = pose_start_time - global_start_time if global_start_time else None
                status = "✅" if abs(offset) < 0.001 else "❌"
                
                print(f"  {status} Start Time: {pose_start_time}")
                print(f"  - Time Format: {time_format}")
                print(f"  - Offset from Global: {offset:.6f}s")
                
                if abs(offset) >= 0.001:
                    pose_aligned = False
            else:
                print(f"  ⚠️  未找到 start_time 属性（旧版本格式）")
                pose_aligned = False
            
            # 检查各个数据集的时间范围
            print(f"\n  📊 数据集时间范围:")
            for key in f.keys():
                if "_timestamp" not in key:
                    # 找到对应的时间戳数据集
                    ts_key = f"{key}_timestamp_recv"
                    if ts_key in f:
                        timestamps = f[ts_key][:]
                        print(f"    - {key}: {timestamps.min():.3f}s ~ {timestamps.max():.3f}s ({len(timestamps)} 样本)")
    else:
        print(f"\n⚠️  未找到 pose.h5（未录制 pose 数据）")
        pose_aligned = None
    
    # 5. 总结
    print(f"\n" + "=" * 80)
    print(f"📊 验证结果:")
    
    if camera_aligned:
        print(f"  ✅ 相机时间轴对齐正确")
    else:
        print(f"  ❌ 相机时间轴未对齐")
    
    if pose_aligned is None:
        print(f"  ⚠️  无 pose 数据")
    elif pose_aligned:
        print(f"  ✅ Pose 时间轴对齐正确")
    else:
        print(f"  ❌ Pose 时间轴未对齐")
    
    all_aligned = camera_aligned and (pose_aligned is None or pose_aligned)
    
    if all_aligned:
        print(f"\n✅ 所有时间轴对齐正确！")
        return True
    else:
        print(f"\n❌ 存在时间对齐问题，请检查录制配置")
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python verify_time_alignment.py <录制目录>")
        print("示例: python verify_time_alignment.py backend/records/1_20251228081509")
        sys.exit(1)
    
    record_dir = sys.argv[1]
    success = verify_time_alignment(record_dir)
    sys.exit(0 if success else 1)
