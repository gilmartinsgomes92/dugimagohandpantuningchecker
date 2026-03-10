
import html2canvas from "html2canvas";

export async function exportShareCard(){

  const element = document.getElementById("share-card");
  if(!element) return;

  const canvas = await html2canvas(element,{
    backgroundColor:null,
    scale:2
  });

  const link = document.createElement("a");
  link.download = "dugimago-handpan-check.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}
