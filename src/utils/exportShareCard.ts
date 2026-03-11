import html2canvas from 'html2canvas';

export async function exportShareCard() {
  const element = document.getElementById('share-result-card');

  if (!element) {
    console.error('Share card element not found');
    window.alert('Could not generate the result card.');
    return;
  }

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: true,
    });

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );

    if (!blob) {
      throw new Error('Failed to create PNG blob');
    }

    const file = new File([blob], 'dugimago-handpan-check.png', {
      type: 'image/png',
    });

    const canNativeShare =
      typeof navigator !== 'undefined' &&
      'share' in navigator &&
      'canShare' in navigator &&
      navigator.canShare({ files: [file] });

    if (canNativeShare) {
      await navigator.share({
        files: [file],
        title: 'Dugimago Handpan Check',
        text: 'Check your handpan with Dugimago Handpan Tuning Check',
      });
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'dugimago-handpan-check.png';
    link.href = url;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export share card:', error);
    window.alert('Failed to generate the result card.');
  }
}
