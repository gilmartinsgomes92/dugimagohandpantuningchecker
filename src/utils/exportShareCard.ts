import html2canvas from 'html2canvas';

export async function exportShareCard(
  elementId = 'share-result-card',
  filename = 'dugimago-handpan-check.png',
) {
  const element = document.getElementById(elementId);

  if (!element) {
    console.error(`Share card element not found: ${elementId}`);
    window.alert('Could not generate the result card.');
    return;
  }

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false,
      imageTimeout: 15000,
    });

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Failed to export share card:', error);
    window.alert('Failed to generate the result card.');
  }
}
