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
      logging: false,
    });

    const link = document.createElement('a');
    link.download = 'dugimago-handpan-check.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (error) {
    console.error('Failed to export share card:', error);
    window.alert('Failed to generate the result card.');
  }
}
