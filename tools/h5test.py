# import h5py

# with h5py.File("/home/egdcsz2/Project/test/engram_DAQ/backend/records/ceshi2_20251225022933/pose.h5", "r") as f:
#     print("Keys:", list(f.keys()))
    
#     for k in f["data"]:
#         grp = f["data"][k]
#         print(f"\n[{k}]")
#         for ds in grp:
#             d = grp[ds]
#             print(f"  {ds}: shape={d.shape}, dtype={d.dtype}")

# import h5py
# import numpy as np

# f = h5py.File("/home/egdcsz2/Project/test/engram_DAQ/backend/records/ceshi2_20251225022933/pose.h5", "r")

# d = f["robot_joint_states_data"]

# print(len(d))
# print(d[0])
# print(d[0].shape)


import h5py
import pandas as pd

pose = h5py.File("/home/egdcsz2/Project/test/engram_DAQ/backend/records/ceshi2_20251225022933/pose.h5", "r")
t_pose = pose["robot_joint_states_t_ros"][:]

print(t_pose.min(), t_pose.max())
