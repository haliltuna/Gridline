import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UploadCloud, FileText, Loader2, ClipboardList, X } from "lucide-react";
import { apiPost } from "@/lib/api";
import { uploadFile } from "@/lib/session";
import type { Job, SpecReadResult } from "@/lib/types";
import Shell, { Panel } from "@/components/Shell";
import ScanSequence from "@/components/ScanSequence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function Drop({
  file, onPick, testId, title, hint, icon: Icon, tall,
}: {
  file: File | null;
  onPick: (f: File | null) => void;
  testId: string;
  title: string;
  hint: string;
  icon: typeof UploadCloud;
  tall?: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      data-testid={testId}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onPick(e.dataTransfer.files?.[0] ?? null); }}
      onClick={() => ref.current?.click()}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center border-2 border-dashed bg-[#0F1722] p-8 text-center transition-colors",
        tall ? "min-h-[300px]" : "min-h-[190px]",
        drag ? "border-[#E2F952] bg-[#131D2A]" : "border-slate-700 hover:border-[#E2F952]/50",
      )}
    >
      <input ref={ref} type="file" accept="application/pdf,.pdf" className="hidden"
             data-testid={`${testId}-input`} onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      {file ? (
        <>
          <FileText className={cn("text-[#E2F952]", tall ? "h-12 w-12" : "h-9 w-9")} />
          <p className="mt-3 max-w-full truncate font-heading text-lg font-semibold text-slate-100" data-testid={`${testId}-filename`}>
            {file.name}
          </p>
          <p className="mt-1 font-mono text-sm text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          <Button type="button" variant="ghost" size="sm" className="mt-2" data-testid={`${testId}-clear`}
                  onClick={(e) => { e.stopPropagation(); onPick(null); }}>
            <X className="h-3.5 w-3.5" /> Remove
          </Button>
        </>
      ) : (
        <>
          <Icon className={cn("text-slate-500", tall ? "h-12 w-12" : "h-9 w-9")} />
          <p className={cn("mt-3 font-heading font-semibold text-slate-100", tall ? "text-2xl" : "text-lg")}>{title}</p>
          <p className="mt-2 text-base text-slate-400">{hint}</p>
          <Button type="button" variant="outline" size={tall ? "lg" : "default"} className="mt-5">Choose PDF</Button>
        </>
      )}
    </div>
  );
}

export default function UploadPage() {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [address, setAddress] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [spec, setSpec] = useState<File | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const pick = (setter: (f: File | null) => void) => (f: File | null) => {
    if (f && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("That needs to be a PDF file");
      return;
    }
    setter(f);
  };

  const run = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a blueprint PDF first");
      const job = await apiPost<Job>("/jobs", {
        name: name || file.name.replace(/\.pdf$/i, ""),
        client_name: client, client_email: clientEmail, address,
      });
      const read = await uploadFile<Job>(`/jobs/${job.id}/upload`, file);
      if (spec) {
        try {
          const res = await uploadFile<SpecReadResult>(`/jobs/${job.id}/spec-sheet`, spec);
          toast.success(`Spec sheet read — ${res.specs.length} product(s) mapped to ${res.applied_to_lines} line(s)`);
        } catch {
          toast.error("Blueprint read, but the spec sheet could not be read");
        }
      }
      return read;
    },
    onSuccess: (job) => {
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Takeoff ready — review and approve");
      navigate(`/jobs/${job.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell title="New takeoff" subtitle="Drop the blueprint in. Add the spec sheet too and we'll match products to rooms.">
      {run.isPending ? (
        <div className="gl-rise">
          <ScanSequence running filename={file?.name ?? "blueprint.pdf"} />
          <Panel className="mt-6 text-center">
            <p className="text-lg text-slate-200" data-testid="upload-progress-note">
              Reading the printed scale and every written dimension. Accuracy over speed — a large set can take a minute or two.
            </p>
            <p className="mt-2 font-mono text-sm text-slate-500">Leave this page open.</p>
          </Panel>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-5">
            <Drop
              tall file={file} onPick={pick(setFile)} testId="upload-dropzone" icon={UploadCloud}
              title="Drag your blueprint PDF here"
              hint="or click to browse — 100+ page sets are fine"
            />
            <div>
              <div className="mb-3 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-[#E2F952]" />
                <h2 className="font-heading text-base font-semibold text-slate-100">
                  Spec sheet / finish schedule <span className="font-normal text-slate-500">(optional)</span>
                </h2>
              </div>
              <Drop
                file={spec} onPick={pick(setSpec)} testId="spec-dropzone" icon={ClipboardList}
                title="Add the product schedule"
                hint="We'll read which product goes in which room, including backsplashes"
              />
            </div>
          </div>

          <Panel className="h-fit">
            <h2 className="font-heading text-lg font-semibold text-slate-100">Job details</h2>
            <form className="mt-5 space-y-4" data-testid="upload-form"
                  onSubmit={(e) => { e.preventDefault(); run.mutate(); }}>
              <div className="space-y-2">
                <Label htmlFor="jobname" className="text-slate-300">Job name</Label>
                <Input id="jobname" data-testid="upload-jobname-input" value={name}
                       onChange={(e) => setName(e.target.value)} placeholder="Oakridge Commons — Phase 2" className="h-12 text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client" className="text-slate-300">Client</Label>
                <Input id="client" data-testid="upload-client-input" value={client}
                       onChange={(e) => setClient(e.target.value)} placeholder="Meridian Construction" className="h-12 text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cemail" className="text-slate-300">Client email</Label>
                <Input id="cemail" type="email" data-testid="upload-client-email-input" value={clientEmail}
                       onChange={(e) => setClientEmail(e.target.value)} placeholder="pm@client.com" className="h-12 text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr" className="text-slate-300">Site address</Label>
                <Input id="addr" data-testid="upload-address-input" value={address}
                       onChange={(e) => setAddress(e.target.value)} className="h-12 text-base" />
              </div>
              <Button type="submit" size="lg" className="w-full font-semibold" data-testid="upload-submit-button" disabled={!file}>
                {run.isPending ? (<><Loader2 className="h-4 w-4 animate-spin" /> Reading…</>) : "Read blueprint"}
              </Button>
              <p className="text-center text-sm text-slate-500">
                You approve every line before anything becomes a quote.
              </p>
            </form>
          </Panel>
        </div>
      )}
    </Shell>
  );
}
