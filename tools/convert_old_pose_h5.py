#!/usr/bin/env python3
"""
转换旧版 pose.h5（绝对时间）到新版（相对时间）

旧版: timestamp 是绝对 epoch 时间
新版: timestamp 是相对时间（从 start_time 开始）
"""

import sys
import os
import json
import h5py
import numpy as np
from pathlib import Path


def convert_pose_h5(record_dir: str, inplace: bool = False):
    """
    转换旧版 pose.h5 到新版格式
    
    Args:
        record_dir: 录制目录路径
        inplace: 是否原地修改（如果为 False，会创建 pose_converted.h5）
    """
    record_path = Path(record_dir)
    pose_h5_path = record_path / "pose.h5"
    
    if not pose_h5_path.exists():
        print(f"❌ 未找到 {pose_h5_path}")
        return False
    
    # 读取 task_info.json 获取 start_time
    task_info_path = record_path / "metadata" / "task_info.json"
    if not task_info_path.exists():
        print(f"❌ 未找到 {task_info_path}")
        return False
    
    with open(task_info_path, "r") as f:
        task_info = json.load(f)
    
    start_time = task_info.get("start_time")
    if not start_time:
        print(f"❌ task_info.json 中未找到 start_time")
        return False
    
    print(f"🔄 转换 pose.h5: {pose_h5_path.name}")
    print(f"  - Start Time: {start_time}")
    
    # 检查是否已经是新格式
    with h5py.File(pose_h5_path, "r") as f:
        if "start_time" in f.attrs:
            print(f"  ℹ️  已经是新格式，无需转换")
            return True
    
    # 创建输出文件
    if inplace:
        output_path = pose_h5_path.parent / "pose_tmp.h5"
    else:
        output_path = pose_h5_path.parent / "pose_converted.h5"
    
    print(f"  - 输出文件: {output_path.name}")
    
    # 转换
    with h5py.File(pose_h5_path, "r") as f_in:
        with h5py.File(output_path, "w") as f_out:
            # 写入新属性
            f_out.attrs["start_time"] = start_time
            f_out.attrs["time_format"] = "relative"
            
            # 复制并转换数据集
            for key in f_in.keys():
                if "_timestamp" in key:
                    # 转换时间戳：绝对时间 -> 相对时间
                    timestamps = f_in[key][:]
                    relative_timestamps = timestamps - start_time
                    
                    f_out.create_dataset(key, data=relative_timestamps)
                    
                    print(f"    ✅ {key}: {timestamps.min():.3f} ~ {timestamps.max():.3f} (绝对)")
                    print(f"       -> {relative_timestamps.min():.3f} ~ {relative_timestamps.max():.3f} (相对)")
                else:
                    # 直接复制数据
                    f_out.create_dataset(key, data=f_in[key][:])
                    print(f"    ✅ {key}: shape={f_in[key].shape}")
    
    # 如果是原地修改，替换原文件
    if inplace:
        import shutil
        backup_path = pose_h5_path.parent / "pose_backup.h5"
        shutil.move(str(pose_h5_path), str(backup_path))
        shutil.move(str(output_path), str(pose_h5_path))
        print(f"\n✅ 转换完成！原文件已备份为: {backup_path.name}")
    else:
        print(f"\n✅ 转换完成！新文件: {output_path}")
    
    return True


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python convert_old_pose_h5.py <录制目录> [--inplace]")
        print("示例: python convert_old_pose_h5.py backend/records/1_20251228081509")
        print("      python convert_old_pose_h5.py backend/records/1_20251228081509 --inplace")
        sys.exit(1)
    
    record_dir = sys.argv[1]
    inplace = "--inplace" in sys.argv
    
    success = convert_pose_h5(record_dir, inplace=inplace)
    sys.exit(0 if success else 1)
