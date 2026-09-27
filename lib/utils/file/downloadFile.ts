export async function downloadFile(href: string, name: string) {
    try {
        // Fetch the file
        const res = await fetch(href)
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`)
        }
        
        const blob = await res.blob()
        
        // Create a blob with explicit MIME type to force download
        const downloadBlob = new Blob([blob], { 
            type: 'application/octet-stream' 
        })
        
        const url = URL.createObjectURL(downloadBlob)
        
        // Create download link with all necessary attributes
        const link = document.createElement('a')
        link.href = url
        link.download = name
        link.style.display = 'none'
        
        // Add to DOM and trigger download
        document.body.appendChild(link)
        
        // Use MouseEvent to simulate a more realistic click
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        })
        
        link.dispatchEvent(event)
        
        // Clean up
        document.body.removeChild(link)
        
        // Delay cleanup to ensure download starts
        setTimeout(() => {
            URL.revokeObjectURL(url)
        }, 1000)
        
        return true
    } catch (error) {
        console.error('Download failed:', error)
        return false
    }
}