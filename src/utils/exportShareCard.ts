import html2canvas from 'html2canvas';

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
    const canvas = await html2canvas(element, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (error) {
    console.error('Failed to export share card:', error);
    window.alert('Failed to generate the result card.');
  }
}
