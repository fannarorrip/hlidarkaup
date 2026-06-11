"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Step = "capture" | "preview" | "uploading" | "done" | "error";

export default function SelfiePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [step, setStep] = useState<Step>("capture");
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [warning, setWarning] = useState("");

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch {
      setErrorMsg("Gat ekki opnað myndagæki. Leyfðu aðgang að myndagæki eða notaðu Hlaða upp mynd í staðinn.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      setPhotoBlob(blob);
      setPhotoUrl(URL.createObjectURL(blob));
      stopCamera();
      setStep("preview");
    }, "image/jpeg", 0.92);
  }, [stopCamera]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoBlob(file);
    setPhotoUrl(URL.createObjectURL(file));
    stopCamera();
    setStep("preview");
  }, [stopCamera]);

  const retake = useCallback(() => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoBlob(null);
    setPhotoUrl(null);
    setStep("capture");
  }, [photoUrl]);

  const submit = useCallback(async () => {
    if (!photoBlob) return;
    setStep("uploading");
    try {
      const form = new FormData();
      form.append("selfie", photoBlob, "selfie.jpg");
      const res = await fetch("/api/sjalfsali/complete", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Villa");
      if (json.warning) setWarning(json.warning);
      setStep("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Eitthvað fór úrskeiðis.");
      setStep("error");
    }
  }, [photoBlob]);

  if (step === "done") {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-5xl">✅</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Skráning tókst!</h1>
        {warning ? (
          <p className="text-gray-500 mb-6">{warning}</p>
        ) : (
          <p className="text-gray-500 mb-6">Andlitsgreining þín hefur verið skráð. Horfðu í myndavélina við dyrnar til að opna sjálfsalann.</p>
        )}
        <Link href="/" className="inline-block bg-brand-red hover:bg-brand-red-dark text-white font-bold px-8 py-3 rounded-xl transition-colors">
          Fara á forsíðu
        </Link>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-5xl">❌</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Eitthvað fór úrskeiðis</h1>
        <p className="text-gray-500 mb-6">{errorMsg}</p>
        <button onClick={() => setStep("capture")} className="bg-brand-red text-white font-bold px-8 py-3 rounded-xl hover:bg-brand-red-dark transition-colors">
          Reyna aftur
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Skráðu andlit þitt</h1>
        <p className="text-gray-500 text-sm">Myndin er notuð til að opna dyr sjálfsalans. Gakktu úr skugga um að andlitið sé skýrt í myndinni.</p>
      </div>

      {step === "capture" && (
        <div className="space-y-4">
          {/* Camera preview */}
          <div className="relative bg-gray-900 rounded-2xl overflow-hidden aspect-[4/3] flex items-center justify-center">
            {/* Video always in DOM so ref is available before startCamera fires */}
            <video
              ref={videoRef}
              className={`w-full h-full object-cover ${cameraActive ? "" : "hidden"}`}
              autoPlay
              playsInline
              muted
            />
            {!cameraActive && (
              <div className="text-center text-gray-400 p-8">
                <div className="text-5xl mb-3">📷</div>
                <p className="text-sm">Kveiktu á myndavél til að taka mynd</p>
              </div>
            )}
            {/* Face guide overlay */}
            {cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-56 border-4 border-white/60 rounded-full opacity-60" />
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          <div className="grid grid-cols-2 gap-3">
            {!cameraActive ? (
              <button onClick={startCamera}
                className="col-span-2 bg-brand-red hover:bg-brand-red-dark text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                <span>📷</span> Kveikja á myndavél
              </button>
            ) : (
              <button onClick={takePhoto}
                className="col-span-2 bg-brand-red hover:bg-brand-red-dark text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                <span>🤳</span> Taka mynd
              </button>
            )}
            <button onClick={() => fileInputRef.current?.click()}
              className="bg-white border border-gray-200 hover:border-gray-400 text-gray-700 font-medium py-3 rounded-xl transition-colors col-span-2 text-sm">
              Hlaða upp mynd af tæki
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          {errorMsg && <p className="text-red-600 text-sm text-center">{errorMsg}</p>}
        </div>
      )}

      {step === "preview" && photoUrl && (
        <div className="space-y-4">
          <div className="rounded-2xl overflow-hidden aspect-[4/3] bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Forskoðun" className="w-full h-full object-cover" />
          </div>
          <p className="text-center text-sm text-gray-500">Er andlitið skýrt og vel ljóst? Þá er hægt að halda áfram.</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={retake}
              className="bg-white border border-gray-200 hover:border-gray-400 text-gray-700 font-bold py-3 rounded-xl transition-colors">
              Taka aftur
            </button>
            <button onClick={submit}
              className="bg-brand-red hover:bg-brand-red-dark text-white font-bold py-3 rounded-xl transition-colors">
              Skrá mig →
            </button>
          </div>
        </div>
      )}

      {step === "uploading" && (
        <div className="text-center py-16">
          <div className="w-16 h-16 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <p className="text-gray-600 font-medium">Skrái þig í kerfið...</p>
          <p className="text-gray-400 text-sm mt-1">Þetta tekur nokkrar sekúndur</p>
        </div>
      )}
    </div>
  );
}
