export const getMediaDimensions = (
    file: File
): Promise<{ width: number; height: number; duration?: number }> => {
    return new Promise((resolve) => {
        if (file.type.startsWith('image/')) {
            const img = new Image();
            img.src = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(img.src); // Clean up
                resolve({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                });
            };

            img.onerror = () => {
                URL.revokeObjectURL(img.src); // Clean up
                resolve({ width: 0, height: 0 });
            };
        } else if (file.type.startsWith('video/')) {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);

            video.onloadedmetadata = () => {
                URL.revokeObjectURL(video.src); // Clean up
                resolve({
                    width: video.videoWidth,
                    height: video.videoHeight,
                    duration: video.duration, // Duration in seconds
                });
            };

            video.onerror = () => {
                URL.revokeObjectURL(video.src); // Clean up
                resolve({ width: 0, height: 0, duration: 0 });
            };
        } else {
            resolve({
                width: 0,
                height: 0,
                duration: 0
            });
        }
    });
};