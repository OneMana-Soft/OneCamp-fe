export function getFriendlyFileExtension(mimeType?: string, fileName?: string): string {
    if (!mimeType) return 'FILE';

    const mimeMap: { [key: string]: string } = {
        // Office
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
        'application/msword': 'DOC',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
        'application/vnd.ms-excel': 'XLS',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
        'application/vnd.ms-powerpoint': 'PPT',
        
        // iWork
        'application/vnd.apple.keynote': 'KEY',
        'application/x-iwork-keynote-sffkey': 'KEY',
        'application/vnd.apple.pages': 'PAGES',
        'application/x-iwork-pages-sffpages': 'PAGES',
        'application/vnd.apple.numbers': 'NUMBERS',
        'application/x-iwork-numbers-sffnumbers': 'NUMBERS',

        // Documents
        'application/pdf': 'PDF',
        'text/plain': 'TXT',
        'text/csv': 'CSV',
        'text/markdown': 'MD',
        'application/rtf': 'RTF',

        // Archives
        'application/zip': 'ZIP',
        'application/x-rar-compressed': 'RAR',
        'application/x-tar': 'TAR',
        'application/x-7z-compressed': '7Z',
        'application/gzip': 'GZ',

        // Code
        'application/json': 'JSON',
        'application/xml': 'XML',
        'text/xml': 'XML',
        'text/html': 'HTML',
        'text/css': 'CSS',
        'application/javascript': 'JS',
        'text/javascript': 'JS',
        'text/x-python': 'PY',
        'text/x-java-source': 'JAVA',
        'text/x-c': 'C',
        'text/x-c++': 'CPP',
        'text/x-shellscript': 'SH',

        // Images
        'image/jpeg': 'JPG',
        'image/png': 'PNG',
        'image/gif': 'GIF',
        'image/webp': 'WEBP',
        'image/svg+xml': 'SVG',
        'image/bmp': 'BMP',
        'image/tiff': 'TIFF',
        'image/vnd.adobe.photoshop': 'PSD',
        'application/postscript': 'AI',

        // Audio
        'audio/mpeg': 'MP3',
        'audio/wav': 'WAV',
        'audio/ogg': 'OGG',
        'audio/mp4': 'M4A',
        'audio/aac': 'AAC',
        'audio/midi': 'MIDI',

        // Video
        'video/mp4': 'MP4',
        'video/x-matroska': 'MKV',
        'video/x-msvideo': 'AVI',
        'video/quicktime': 'MOV',
        'video/webm': 'WEBM',
        'video/3gpp': '3GP',
    };

    // 1. Check exact MIME match
    if (mimeMap[mimeType]) {
        return mimeMap[mimeType];
    }

    // 2. Try to get extension from filename
    if (fileName) {
        const ext = fileName.split('.').pop();
        if (ext && ext !== fileName) {
            return ext.toUpperCase();
        }
    }

    // 3. Fallback: simplified MIME type (e.g. "image/jpeg" -> "JPEG")
    const parts = mimeType.split('/');
    if (parts.length === 2) {
        // Handle cases like "vnd.android.package-archive" -> "APK" logic if needed, 
        // but usually just taking the second part is "okay" as a last resort, 
        // though it might be verbose. 
        // Let's try to be smarter: if it starts with "vnd.", strip it.
        const subtype = parts[1];
        if (subtype.startsWith('vnd.')) {
            // e.g. vnd.android.package-archive
            const subParts = subtype.split('.');
            return subParts[subParts.length - 1].toUpperCase(); // "package-archive" -> "ARCHIVE"? Or "android"? 
            // Actually, for "vnd.openxmlformats-officedocument.wordprocessingml.document", 
            // the last part is "document", which is generic.
            // But we handled the specific office ones in the map.
        }
        return subtype.toUpperCase();
    }

    return 'FILE';
}
