import cv2
import numpy as np

depth = cv2.imread("./000007.png", cv2.IMREAD_UNCHANGED)
print(depth.shape, depth.dtype)
print("min:", depth.min(), "max:", depth.max())

# 看一下值分布
hist, bins = np.histogram(depth, bins=20)
print("bins:", bins)
print("hist:", hist)
