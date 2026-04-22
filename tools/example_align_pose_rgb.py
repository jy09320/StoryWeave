#!/usr/bin/env python3
"""
示例：如何正确对齐 RGB 帧和 Pose 数据

展示：
1. 根据时间戳找到某个 RGB 帧对应的 pose
2. 根据 pose 时间戳找到对应的 RGB 帧
3. 可视化时间对齐结果
"""

import sys
import cv2
import h5py
import numpy as np
import pandas as pd
from pathlib import Path


def find_closest_pose(target_time: float, pose_timestamps: np.ndarray) -> int:
    """
    根据目标时间找到最接近的 pose 索引
    
    Args:
        target_time: 目标时间（秒）
        pose_timestamps: pose 时间戳数组
    
    Returns:
        最接近的索引
    """
    idx = np.argmin(np.abs(pose_timestamps - target_time))
    return int(idx)


def find_closest_frame(target_time: float, camera_name: str, frames_df: pd.DataFrame) -> int:
    """
    根据目标时间找到最接近的相机帧
    
    Args:
        target_time: 目标时间（秒）
        camera_name: 相机名称
        frames_df: frames.csv 的 DataFrame
    
    Returns:
        最接近的 frame_id
    """
    cam_frames = frames_df[frames_df['camera_name'] == camera_name]
    idx = (cam_frames['timestamp'] - target_time).abs().idxmin()
    return int(cam_frames.loc[idx, 'frame_id'])


def example_align_pose_rgb(record_dir: str, camera_name: str = "cam1"):
    """
    示例：对齐 pose 和 RGB 数据
    
    Args:
        record_dir: 录制目录路径
        camera_name: 相机名称
    """
    record_path = Path(record_dir)
    
    print(f"📁 录制目录: {record_path.name}")
    print(f"📷 相机: {camera_name}")
    print("=" * 80)
    
    # 1. 读取 frames.csv
    frames_csv_path = record_path / "frames.csv"
    df = pd.read_csv(frames_csv_path)
    cam_df = df[df['camera_name'] == camera_name].copy()
    
    print(f"\n🎞️  相机帧:")
    print(f"  - 总帧数: {len(cam_df)}")
    print(f"  - 时间范围: {cam_df['timestamp'].min():.3f}s ~ {cam_df['timestamp'].max():.3f}s")
    print(f"  - 平均帧率: {len(cam_df) / (cam_df['timestamp'].max() - cam_df['timestamp'].min()):.2f} FPS")
    
    # 2. 读取 pose.h5
    pose_h5_path = record_path / "pose.h5"
    if not pose_h5_path.exists():
        print(f"\n❌ 未找到 pose.h5")
        return
    
    with h5py.File(pose_h5_path, "r") as f:
        # 检查格式
        if "start_time" not in f.attrs:
            print(f"\n⚠️  这是旧版 pose.h5（绝对时间），请先运行转换工具：")
            print(f"     python tools/convert_old_pose_h5.py {record_dir}")
            return
        
        print(f"\n🤖 Pose 数据:")
        print(f"  - Start Time: {f.attrs['start_time']}")
        print(f"  - Time Format: {f.attrs.get('time_format', 'unknown')}")
        
        # 找到所有数据集
        datasets = [key for key in f.keys() if not key.endswith("_timestamp_ros") 
                    and not key.endswith("_timestamp_recv") 
                    and not key.endswith("_timestamp_send")]
        
        if not datasets:
            print(f"  ❌ 未找到任何 pose 数据集")
            return
        
        # 使用第一个数据集做示例
        dataset_name = datasets[0]
        print(f"  - 使用数据集: {dataset_name}")
        
        pose_data = f[dataset_name][:]
        pose_ts = f[f"{dataset_name}_timestamp_recv"][:]
        
        print(f"  - 样本数: {len(pose_data)}")
        print(f"  - 时间范围: {pose_ts.min():.3f}s ~ {pose_ts.max():.3f}s")
        print(f"  - 采样率: {len(pose_data) / (pose_ts.max() - pose_ts.min()):.2f} Hz")
        
        # 3. 示例 1：从 RGB 帧找对应的 pose
        print(f"\n" + "=" * 80)
        print(f"🔍 示例 1：从 RGB 帧找对应的 pose")
        
        # 选择几个关键帧
        test_frames = [0, len(cam_df) // 4, len(cam_df) // 2, 3 * len(cam_df) // 4, len(cam_df) - 1]
        
        for frame_id in test_frames:
            if frame_id >= len(cam_df):
                continue
            
            frame_row = cam_df.iloc[frame_id]
            frame_time = frame_row['timestamp']
            
            # 找到最接近的 pose
            pose_idx = find_closest_pose(frame_time, pose_ts)
            pose_time = pose_ts[pose_idx]
            time_diff = abs(pose_time - frame_time) * 1000  # ms
            
            print(f"\n  Frame {frame_row['frame_id']:3d} (t={frame_time:.3f}s)")
            print(f"    -> Pose {pose_idx:3d} (t={pose_time:.3f}s)")
            print(f"    -> 时间差: {time_diff:.1f} ms")
            print(f"    -> Pose 值: {pose_data[pose_idx][:5]}...")  # 只显示前 5 个维度
        
        # 4. 示例 2：从 pose 找对应的 RGB 帧
        print(f"\n" + "=" * 80)
        print(f"🔍 示例 2：从 pose 找对应的 RGB 帧")
        
        # 选择几个关键 pose
        test_poses = [0, len(pose_data) // 4, len(pose_data) // 2, 3 * len(pose_data) // 4, len(pose_data) - 1]
        
        for pose_idx in test_poses:
            pose_time = pose_ts[pose_idx]
            
            # 找到最接近的帧
            frame_id = find_closest_frame(pose_time, camera_name, df)
            frame_row = cam_df[cam_df['frame_id'] == frame_id].iloc[0]
            frame_time = frame_row['timestamp']
            time_diff = abs(pose_time - frame_time) * 1000  # ms
            
            print(f"\n  Pose {pose_idx:3d} (t={pose_time:.3f}s)")
            print(f"    -> Frame {frame_id:3d} (t={frame_time:.3f}s)")
            print(f"    -> 时间差: {time_diff:.1f} ms")
            print(f"    -> 视频路径: {frame_row['color_path']}")
            print(f"    -> 深度路径: {frame_row['depth_path']}")
        
        # 5. 时间对齐质量分析
        print(f"\n" + "=" * 80)
        print(f"📊 时间对齐质量分析")
        
        # 对每一帧计算最近的 pose 时间差
        time_diffs = []
        for _, row in cam_df.iterrows():
            frame_time = row['timestamp']
            pose_idx = find_closest_pose(frame_time, pose_ts)
            pose_time = pose_ts[pose_idx]
            time_diffs.append(abs(pose_time - frame_time) * 1000)  # ms
        
        time_diffs = np.array(time_diffs)
        
        print(f"\n  相机帧 -> Pose 时间差统计:")
        print(f"    - 平均: {time_diffs.mean():.2f} ms")
        print(f"    - 中位数: {np.median(time_diffs):.2f} ms")
        print(f"    - 最大: {time_diffs.max():.2f} ms")
        print(f"    - 最小: {time_diffs.min():.2f} ms")
        print(f"    - 标准差: {time_diffs.std():.2f} ms")
        
        # 判断对齐质量
        if time_diffs.mean() < 20:
            print(f"\n  ✅ 时间对齐质量：优秀（平均误差 < 20ms）")
        elif time_diffs.mean() < 50:
            print(f"\n  ⚠️  时间对齐质量：良好（平均误差 < 50ms）")
        else:
            print(f"\n  ❌ 时间对齐质量：较差（平均误差 >= 50ms）")
            print(f"     建议检查采集配置或网络延迟")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python example_align_pose_rgb.py <录制目录> [相机名称]")
        print("示例: python example_align_pose_rgb.py backend/records/1_20251228081509 cam1")
        sys.exit(1)
    
    record_dir = sys.argv[1]
    camera_name = sys.argv[2] if len(sys.argv) > 2 else "cam1"
    
    example_align_pose_rgb(record_dir, camera_name)
