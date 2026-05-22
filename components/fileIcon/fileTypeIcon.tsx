import { FileText, FileSpreadsheet, FileCode, FileImage } from "@/lib/icons";
import { Presentation, FileBox, FileArchive } from "@/lib/icons";

import {
    FileAiIcon,
    FileApkIcon,
    FileAviIcon,
    FileCodeIcon,
    FileCsvIcon,
    FileDmgIcon,
    FileDwgIcon,
    FileEpsIcon,
    FileExeIcon,
    FileIcon,
    FileJsonIcon,
    FileLogIcon,
    FileM4aIcon,
    FileMarkdownIcon,
    FileMkvIcon,
    FileMp3Icon,
    FileOggIcon,
    FilePdfIcon,
    FilePsdIcon,
    FileQtzIcon,
    FileRarIcon,
    FileSqlIcon,
    FileTarIcon,
    FileTxtIcon,
    FileWavIcon,
    FileXmlIcon,
    FileZipIcon
} from "@/components/fileIcon/fileIcon";

function isCodelike(fileType: string) {
    // return true if file type is a common programming language file extension
    return (
        fileType === 'application/javascript' ||
        fileType === 'application/typescript' ||
        fileType === 'application/x-sh' ||
        fileType === 'application/x-shellscript' ||
        fileType === 'text/html' ||
        fileType === 'text/javascript' ||
        fileType === 'text/jsx' ||
        fileType === 'text/css' ||
        fileType === 'text/less' ||
        fileType === 'text/x-c' ||
        fileType === 'text/x-c++' ||
        fileType === 'text/x-csharp' ||
        fileType === 'text/x-csharp-script' ||
        fileType === 'text/x-java' ||
        fileType === 'text/x-objective' ||
        fileType === 'text/x-objectivec' ||
        fileType === 'text/x-php' ||
        fileType === 'text/x-python' ||
        fileType === 'text/x-ruby' ||
        fileType === 'text/x-ruby-script'
    )
}

export function FileTypeIcon({
                                 name,
                                 fileType,
                                 size = 24
                             }: {
    name: string | null
    fileType?: string
    size?: number
}) {


    if (fileType && isCodelike(fileType)) {
        return <FileCodeIcon size={size} />
    }

    switch (fileType) {
        // keynote
        case 'application/vnd.apple.keynote':
        case 'application/x-iwork-keynote-sffkey':
            return <Presentation className="text-orange-500" size={size} />
        // pages
        case 'application/vnd.apple.pages':
        case 'application/x-iwork-pages-sffpages':
            return <FileText className="text-blue-500" size={size} />
        // numbers
        case 'application/vnd.apple.numbers':
        case 'application/x-iwork-numbers-sffnumbers':
            return <FileSpreadsheet className="text-green-500" size={size} />
        // powerpoint
        case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        case 'application/vnd.ms-powerpoint.presentation.macroEnabled.12':
        case 'application/vnd.ms-powerpoint':
            return <Presentation className="text-orange-500" size={size} />
        // excel
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        case 'application/vnd.ms-excel.sheet.macroEnabled.12':
        case 'application/vnd.ms-excel':
            return <FileSpreadsheet className="text-green-500" size={size} />
        // word
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case 'application/vnd.ms-word.document.macroEnabled.12':
        case 'application/vnd.ms-word':
        case 'application/msword':
            return <FileText className="text-blue-500" size={size} />
        // pdf
        case 'application/pdf':
            return <FilePdfIcon size={size} className='text-tertiary' />
        // adobe illustrator
        case 'application/postscript':
        case 'application/vnd.adobe.illustrator':
            return <FileAiIcon size={size} className='text-tertiary' />
        // adobe photoshop
        case 'image/vnd.adobe.photoshop':
            return <FilePsdIcon size={size} className='text-tertiary' />
        // adobe eps
        case 'application/eps':
            return <FileEpsIcon size={size} className='text-tertiary' />
        //wav
        case 'audio/wav':
            return <FileWavIcon size={size} className='text-tertiary' />
        //mp3
        case 'audio/mpeg':
            return <FileMp3Icon size={size} className='text-tertiary' />
        // csv
        case 'text/csv':
            return <FileCsvIcon size={size} className='text-tertiary' />
        // txt
        case 'text/plain':
            return <FileTxtIcon size={size} className='text-tertiary' />
        // zip
        case 'application/zip':
            return <FileZipIcon size={size} className='text-tertiary' />
        // rar
        case 'application/x-rar-compressed':
            return <FileRarIcon size={size} className='text-tertiary' />
        // dmg
        case 'application/x-apple-diskimage':
            return <FileDmgIcon size={size} className='text-tertiary' />
        // misc
        case 'application/octet-stream':
            if (name?.endsWith('.sketch')) return <FileImage className="text-purple-500" size={size} />
            if (name?.endsWith('.dwg')) return <FileDwgIcon size={size} className='text-tertiary' />
            if (name?.endsWith('.qtz')) return <FileQtzIcon size={size} className='text-tertiary' />
            break
        // figma
        case 'application/figma':
        case 'application/x-figma':
            return <FileImage className="text-purple-500" size={size} />
        // exe
        case 'application/x-msdownload':
            return <FileExeIcon size={size} className='text-tertiary' />
        // mkv
        case 'video/x-matroska':
            return <FileMkvIcon size={size} className='text-tertiary' />
        // avi
        case 'video/x-msvideo':
            return <FileAviIcon size={size} className='text-tertiary' />
        // tar
        case 'application/x-tar':
            return <FileTarIcon size={size} className='text-tertiary' />
        // log
        case 'text/x-log':
            return <FileLogIcon size={size} className='text-tertiary' />
        // sql
        case 'application/sql':
            return <FileSqlIcon size={size} className='text-tertiary' />
        // apk
        case 'application/vnd.android.package-archive':
            return <FileApkIcon size={size} className='text-tertiary' />
        // ogg
        case 'audio/ogg':
            return <FileOggIcon size={size} className='text-tertiary' />
        // m4a
        case 'audio/mp4':
            return <FileM4aIcon size={size} className='text-tertiary' />
        // markdown
        case 'text/markdown':
            return <FileMarkdownIcon size={size} className='text-tertiary' />
        // swift
        case 'text/x-swift':
            return <FileCode className="text-blue-400" size={size} />
        // dockerfile
        case 'text/x-dockerfile':
            return <FileCode className="text-blue-400" size={size} />
        // xml
        case 'text/xml':
            return <FileXmlIcon size={size} className='text-tertiary' />
        // json
        case 'application/json':
            return <FileJsonIcon size={size} className='text-tertiary' />
        default: {
            return <FileIcon size={size} className='text-tertiary' />
        }
    }
}
