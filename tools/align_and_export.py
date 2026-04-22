#!/usr/bin/env python3
"""
后处理时间对齐工具 - 用于模型训练前的数据对齐

功能：
1. 检测并补偿时间漂移
2. 对齐 camera frames 和 pose samples
3. 导出训练就绪的对齐数据

使用场景：
- 在模型训练前使用，确保数据完全对齐
- 可以补偿录制时的轻微时间漂移
"""

import sys
import os
import json
import h5py
import pandas as pd
import numpy as np
from pathlib import Path
from scipy import interpolate
import argparse


class TimeAligner:
    """时间对齐器"""
    
    def __init__(self, record_dir: str):
        self.record_dir = Path(record_dir).resolve()  # 使用绝对路径
        self.df_frames = None
        self.pose_data = {}
        self.global_start_time = None
        
    def load_data(self):
        """加载录制数据"""
        print(f"📂 加载数据: {self.record_dir.name}")
        
        # 1. 读取全局起始时间
        task_info_path = self.record_dir / "metadata" / "task_info.json"
        with open(task_info_path, "r") as f:
            task_info = json.load(f)
        self.global_start_time = task_info.get("start_time")
        
        # 2. 读取 frames.csv
        frames_csv_path = self.record_dir / "frames.csv"
        self.df_frames = pd.read_csv(frames_csv_path)
        print(f"  ✅ Frames: {len(self.df_frames)} 帧")
        
        # 3. 读取 pose.h5
        pose_h5_path = self.record_dir / "pose.h5"
        if not pose_h5_path.exists():
            print(f"  ⚠️  未找到 pose.h5")
            return False
        
        with h5py.File(pose_h5_path, "r") as f:
            for key in f.keys():
                if not key.endswith("_timestamp_recv") and not key.endswith("_timestamp_ros") and not key.endswith("_timestamp_send"):
                    data_key = key
                    ts_key = f"{key}_timestamp_recv"
                    
                    if ts_key in f:
                        self.pose_data[data_key] = {
                            'data': f[data_key][:],
                            'timestamps': f[ts_key][:],
                        }
        
        print(f"  ✅ Pose datasets: {list(self.pose_data.keys())}")
        return True
    
    def detect_drift(self):
        """检测时间漂移"""
        print(f"\n⏱️  检测时间漂移...")
        
        camera_start = self.df_frames['timestamp'].min()
        camera_end = self.df_frames['timestamp'].max()
        
        # 收集所有 pose 时间戳
        all_pose_ts = []
        for data in self.pose_data.values():
            all_pose_ts.extend(data['timestamps'])
        all_pose_ts = np.array(all_pose_ts)
        
        pose_start = all_pose_ts.min()
        pose_end = all_pose_ts.max()
        
        start_offset = camera_start - pose_start
        end_offset = camera_end - pose_end
        duration = camera_end - camera_start
        
        drift = end_offset - start_offset
        drift_rate = (drift / duration) * 1000 if duration > 0 else 0
        
        print(f"  - 录制时长: {duration:.3f}s")
        print(f"  - 起始偏移: {start_offset*1000:.2f}ms")
        print(f"  - 结束偏移: {end_offset*1000:.2f}ms")
        print(f"  - 累积漂移: {drift*1000:.2f}ms")
        print(f"  - 漂移率: {drift_rate:.4f} ms/s")
        
        return {
            'start_offset': start_offset,
            'end_offset': end_offset,
            'drift': drift,
            'drift_rate': drift_rate,
            'duration': duration,
        }
    
    def align_pose_to_frames(self, method='linear', tolerance_ms=50):
        """
        将 pose 数据对齐到每一帧
        
        Args:
            method: 插值方法 ('linear', 'nearest', 'cubic')
            tolerance_ms: 容忍的外推距离（毫秒）
        
        Returns:
            对齐后的数据字典
        """
        print(f"\n🔄 对齐 Pose 到 Frames (method={method})...")
        
        aligned_data = {}
        tolerance_s = tolerance_ms / 1000.0
        
        # 为每个相机分别对齐
        for camera_name in self.df_frames['camera_name'].unique():
            cam_df = self.df_frames[self.df_frames['camera_name'] == camera_name].sort_values('timestamp')
            frame_times = cam_df['timestamp'].values
            
            aligned_data[camera_name] = {
                'frame_ids': cam_df['frame_id'].values,
                'timestamps': frame_times,
                'color_paths': cam_df['color_path'].values,
                'depth_paths': cam_df['depth_path'].values,
            }
            
            # 对每个 pose dataset 进行插值
            for pose_name, pose_info in self.pose_data.items():
                pose_ts = pose_info['timestamps']
                pose_values = pose_info['data']
                
                # 检查时间范围
                pose_start = pose_ts.min()
                pose_end = pose_ts.max()
                
                # 过滤掉超出范围的帧
                valid_mask = (frame_times >= pose_start - tolerance_s) & (frame_times <= pose_end + tolerance_s)
                valid_frame_times = frame_times[valid_mask]
                
                if len(valid_frame_times) == 0:
                    print(f"  ⚠️  {camera_name} - {pose_name}: 没有有效的重叠时间")
                    continue
                
                # 插值
                if pose_values.ndim == 1:
                    # 1D 数据
                    interp_func = interpolate.interp1d(
                        pose_ts, pose_values, 
                        kind=method, 
                        fill_value='extrapolate',
                        bounds_error=False
                    )
                    aligned_values = interp_func(valid_frame_times)
                else:
                    # 多维数据，逐列插值
                    aligned_values = np.zeros((len(valid_frame_times), pose_values.shape[1]))
                    for i in range(pose_values.shape[1]):
                        interp_func = interpolate.interp1d(
                            pose_ts, pose_values[:, i], 
                            kind=method, 
                            fill_value='extrapolate',
                            bounds_error=False
                        )
                        aligned_values[:, i] = interp_func(valid_frame_times)
                
                # 存储对齐后的数据（只保存有效范围内的）
                if pose_name not in aligned_data[camera_name]:
                    aligned_data[camera_name][pose_name] = {}
                
                aligned_data[camera_name][pose_name] = {
                    'data': aligned_values,
                    'valid_mask': valid_mask,
                }
                
                coverage = len(valid_frame_times) / len(frame_times) * 100
                print(f"  ✅ {camera_name} - {pose_name}: {len(valid_frame_times)}/{len(frame_times)} 帧 ({coverage:.1f}%)")
        
        return aligned_data
    
    def export_aligned_data(self, aligned_data, output_dir=None):
        """
        导出对齐后的数据
        
        输出格式：
        - aligned/
          - cam1/
            - metadata.json  (frame info)
            - ee_pose.npy
            - joint_states.npy
            - ...
          - cam2/
            - ...
        """
        if output_dir is None:
            output_dir = self.record_dir / "aligned"
        else:
            output_dir = Path(output_dir)
        
        print(f"\n💾 导出对齐数据到: {output_dir}")
        
        for camera_name, cam_data in aligned_data.items():
            cam_dir = output_dir / camera_name
            cam_dir.mkdir(parents=True, exist_ok=True)
            
            # 导出帧元数据
            frame_metadata = {
                'camera_name': camera_name,
                'frame_ids': cam_data['frame_ids'].tolist(),
                'timestamps': cam_data['timestamps'].tolist(),
                'color_paths': cam_data['color_paths'].tolist(),
                'depth_paths': cam_data['depth_paths'].tolist(),
            }
            
            with open(cam_dir / "frames.json", "w") as f:
                json.dump(frame_metadata, f, indent=2)
            
            # 导出 pose 数据
            for pose_name, pose_info in cam_data.items():
                if pose_name in ['frame_ids', 'timestamps', 'color_paths', 'depth_paths']:
                    continue
                
                aligned_values = pose_info['data']
                valid_mask = pose_info['valid_mask']
                
                # 保存完整数据（包括 NaN 标记的无效帧）
                full_data = np.full((len(valid_mask), aligned_values.shape[1] if aligned_values.ndim > 1 else 1), np.nan)
                full_data[valid_mask] = aligned_values.reshape(len(aligned_values), -1)
                
                np.save(cam_dir / f"{pose_name}.npy", full_data)
                print(f"  ✅ {camera_name}/{pose_name}.npy")
        
        # 导出对齐报告
        report = {
            'record_dir': str(self.record_dir),
            'global_start_time': self.global_start_time,
            'cameras': list(aligned_data.keys()),
            'pose_datasets': list(self.pose_data.keys()),
        }
        
        with open(output_dir / "alignment_report.json", "w") as f:
            json.dump(report, f, indent=2)
        
        print(f"\n✅ 导出完成!")
        return output_dir


def main():
    parser = argparse.ArgumentParser(description="对齐 camera 和 pose 数据用于模型训练")
    parser.add_argument("record_dir", help="录制目录路径")
    parser.add_argument("--method", default="linear", choices=["linear", "nearest", "cubic"], 
                       help="插值方法")
    parser.add_argument("--tolerance-ms", type=float, default=50, 
                       help="容忍的外推距离（毫秒）")
    parser.add_argument("--output", default=None, help="输出目录（默认为 record_dir/aligned）")
    
    args = parser.parse_args()
    
    # 1. 创建对齐器
    aligner = TimeAligner(args.record_dir)
    
    # 2. 加载数据
    if not aligner.load_data():
        print("❌ 数据加载失败")
        return 1
    
    # 3. 检测漂移
    drift_info = aligner.detect_drift()
    
    # 4. 对齐数据
    aligned_data = aligner.align_pose_to_frames(
        method=args.method,
        tolerance_ms=args.tolerance_ms
    )
    
    # 5. 导出
    output_dir = aligner.export_aligned_data(aligned_data, args.output)
    
    print(f"\n📊 使用方法:")
    print(f"  import numpy as np")
    print(f"  import json")
    print(f"  ")
    print(f"  # 读取 cam1 的对齐数据")
    print(f"  with open('{output_dir}/cam1/frames.json') as f:")
    print(f"      frames = json.load(f)")
    print(f"  ")
    print(f"  ee_pose = np.load('{output_dir}/cam1/ee_pose.npy')")
    print(f"  # shape: (num_frames, 7)  # position + quaternion")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
