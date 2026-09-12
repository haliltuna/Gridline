import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UploadCloud, FileText, Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api";
import { uploadFile } from "@/lib/session";
import type { Job } from "@/lib/types";
import Shell, { Panel } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function UploadPage() {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [address, setAddress] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a blueprint PDF first");
      const job = await apiPost<Job>("/jobs", {
        name: name || file.name.replace(/\.pdf$/i, ""),
        client_name: client,
        client_email: clientEmail,
        address,
      });
      return uploadFile<Job>(`/jobs/${job.id}/upload`, file);
    },
    onSuccess: (job) => {
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Blueprint read — review your takeoff");
      navigate(`/jobs/${job.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pick = (f: File | null) => {
    if (f && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Blueprints must be PDF files");
      return;
    }
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.pdf$/i, ""));
  };

  return (
    <Shell title="Upload a blueprint" subtitle="Drop the PDF set in. Big sets are fine — we sample across every sheet.">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div
          data-testid="upload-dropzone"
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0] ?? null); }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex min-h-[320px] cursor-pointer flex-col items-center justify-center border-2 border-dashed bg-[#0F1722] p-10 text-center transition-colors",
            drag ? "border-[#E2F952] bg-[#131D2A]" : "border-slate-700 hover:border-[#E2F952]/50",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            data-testid="upload-file-input"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <FileText className="h-12 w-12 text-[#E2F952]" />
              <p className="mt-4 font-heading text-xl font-semibold text-slate-100" data-testid="upload-filename">{file.name}</p>
              <p className="mt-1 font-mono text-sm text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB · click to replace</p>
            </>
          ) : (
            <>
              <UploadCloud className="h-12 w-12 text-slate-500" />
              <p className="mt-4 font-heading text-2xl font-semibold text-slate-100">Drag your blueprint PDF here</p>
              <p className="mt-2 text-base text-slate-400">or click to browse your files</p>
              <Button type="button" variant="outline" size="lg" className="mt-6" data-testid="upload-browse-button">
                Choose PDF
              </Button>
            </>
          )}
        </div>

        <Panel>
          <h2 className="font-heading text-lg font-semibold text-slate-100">Job details</h2>
          <form
            className="mt-5 space-y-4"
            data-testid="upload-form"
            onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
          >
            <div className="space-y-2">
              <Label htmlFor="jobname" className="text-slate-300">Job name</Label>
              <Input id="jobname" data-testid="upload-jobname-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Oakridge Commons — Phase 2" className="h-12 text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client" className="text-slate-300">Client</Label>
              <Input id="client" data-testid="upload-client-input" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Meridian Construction" className="h-12 text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cemail" className="text-slate-300">Client email</Label>
              <Input id="cemail" type="email" data-testid="upload-client-email-input" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="pm@client.com" className="h-12 text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addr" className="text-slate-300">Site address</Label>
              <Input id="addr" data-testid="upload-address-input" value={address} onChange={(e) => setAddress(e.target.value)} className="h-12 text-base" />
            </div>
            <Button type="submit" size="lg" className="w-full font-semibold" data-testid="upload-submit-button" disabled={mut.isPending || !file}>
              {mut.isPending ? (<><Loader2 className="h-4 w-4 animate-spin" /> Reading blueprint…</>) : "Read blueprint"}
            </Button>
            {mut.isPending && (
              <p className="text-center text-sm text-slate-400" data-testid="upload-progress-note">
                Recording the printed scale and every written dimension. Accuracy over speed — this can take a minute.
              </p>
            )}
          </form>
        </Panel>
      </div>
    </Shell>
  );
}
