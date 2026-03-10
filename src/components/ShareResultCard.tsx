
import type { TuningResult } from "../contexts/AppContext";

type Props = {
  selectedScale: string | null;
  tuningResults: TuningResult[];
};

function computeSummary(results: TuningResult[]) {
  const checked = results.filter(r => r.status !== "pending" && r.status !== "skipped");

  const deviations = checked
    .map(r => Math.abs(r.cents ?? 0))
    .filter(v => Number.isFinite(v));

  const avg = deviations.length
    ? deviations.reduce((a,b)=>a+b,0)/deviations.length
    : 0;

  const out = checked.filter(r => r.status === "out-of-tune").length;
  const slight = checked.filter(r => r.status === "slightly-out-of-tune").length;

  let status = "Excellent";
  if(out>0) status = "Needs Attention";
  else if(slight>0) status = "Good";

  const health = Math.max(0, Math.round(100 - avg*2));

  return {avg,status,health};
}

export default function ShareResultCard({selectedScale,tuningResults}:Props){

  const s = computeSummary(tuningResults);

  return (
    <div
      id="share-card"
      style={{
        width:480,
        padding:28,
        borderRadius:18,
        background:"#0f1724",
        color:"#fff",
        fontFamily:"system-ui, sans-serif",
        textAlign:"center"
      }}
    >
      <div style={{fontSize:22,fontWeight:700,marginBottom:10}}>
        Dugimago Handpan Check
      </div>

      <div style={{fontSize:36,fontWeight:800,marginBottom:10}}>
        {s.status}
      </div>

      <div style={{fontSize:16,opacity:0.9}}>
        Scale: {selectedScale ?? "Unknown"}
      </div>

      <div style={{marginTop:8,fontSize:16}}>
        Health Score: {s.health}%
      </div>

      <div style={{marginTop:8,fontSize:14,opacity:0.8}}>
        Avg deviation: {s.avg.toFixed(1)} cents
      </div>

      <div style={{marginTop:20,fontSize:12,opacity:0.6}}>
        tuner.dugimago.com
      </div>
    </div>
  );
}
