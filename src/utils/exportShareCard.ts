import html2canvas from 'html2canvas';

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Failed to convert canvas to blob.'));
    }, 'image/png');
  });
}

export async function exportShareCard(
  elementId: string = 'share-result-card',
  filename: string = 'dugimago-handpan-check.png',
) {
  const element = document.getElementById(elementId);

  if (!element) {
    console.error('Share card element not found');
    window.alert('Could not generate the result card.');
    return;
  }

  try {
    if ('fonts' in document) {
      await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
    }

    await nextFrame();

    const canvas = await html2canvas(element, {
      backgroundColor: null,
      scale: Math.max(2, window.devicePixelRatio || 1),
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.max(document.documentElement.clientWidth, element.scrollWidth),
      windowHeight: Math.max(document.documentElement.clientHeight, element.scrollHeight),
    });

    const blob = await canvasToBlob(canvas);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  } catch (error) {
    console.error('Failed to export share card:', error);
    window.alert('Failed to generate the result card.');
  }
}
