"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_SUBMISSION_CONTACT_LENGTH,
  MAX_SUBMISSION_DESCRIPTION_LENGTH,
  MAX_SUBMISSION_NAME_LENGTH,
  SubmissionCreateRequest,
  SubmissionFormData,
  createEmptySubmissionForm,
  normalizePhotoUrls,
  submissionCategories,
  validateSubmissionFields,
} from "@/lib/submissions";

const inputClassName =
  "h-11 border-white/10 bg-dark-900/70 px-4 text-white placeholder:text-gray-500 shadow-none";

const textareaClassName =
  "min-h-[140px] border-white/10 bg-dark-900/70 px-4 py-3 text-white placeholder:text-gray-500 shadow-none";

interface SubmissionErrorResponse {
  error?: string;
}


function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label className="mb-2 block text-sm font-medium text-gray-300" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

function InlineMessage({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "error" | "info";
}) {
  const toneClassName =
    tone === "error"
      ? "border-red-500/30 bg-red-900/20 text-red-300"
      : "border-white/10 bg-white/5 text-gray-300";

  return (
    <div
      aria-live="polite"
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${toneClassName}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "error" ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      )}
      <div>{children}</div>
    </div>
  );
}

function SubmissionSuccessState({ onReset }: { onReset: () => void }) {
  return (
    <Card className="border-white/10 bg-dark-800/90 text-white shadow-2xl shadow-black/20">
      <CardHeader className="items-center px-8 pt-8 text-center">
        <div className="flex size-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
          <CheckCircle2 className="size-8" />
        </div>
        <CardTitle className="text-2xl text-white">Submission received</CardTitle>
        <CardDescription className="max-w-md text-sm leading-6 text-gray-400">
          The verification team will review the asset details and contact you within
          48 hours using the email address or Telegram handle you provided.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-8 pb-8 text-center">
        <InlineMessage tone="info">
          You do not need to keep a wallet connected for this intake flow. If the
          asset is approved, the team will coordinate the next on-chain step with
          you directly.
        </InlineMessage>
        <Button
          className="h-11 w-full bg-white/5 text-white hover:bg-white/10"
          onClick={onReset}
          type="button"
          variant="outline"
        >
          <RefreshCcw className="size-4" />
          Submit another asset
        </Button>
      </CardContent>
    </Card>
  );
}

export function AssetSubmissionForm() {
  const [form, setForm] = useState<SubmissionFormData>(() => createEmptySubmissionForm());
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = <Field extends keyof SubmissionFormData>(
    field: Field,
    value: SubmissionFormData[Field]
  ) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const updatePhoto = (index: number, value: string) => {
    setForm((currentForm) => {
      const nextPhotos = currentForm.photos.slice();
      nextPhotos[index] = value;

      return {
        ...currentForm,
        photos: nextPhotos,
      };
    });
  };

  const resetForm = () => {
    setForm(createEmptySubmissionForm());
    setErrorMessage("");
    setIsSubmitted(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const photos = normalizePhotoUrls(form.photos);
    const validationMessage = validateSubmissionFields({
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim(),
      photos,
      contact: form.contact.trim(),
    });

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);

    const payload: SubmissionCreateRequest = {
      ...form,
      name: form.name.trim(),
      description: form.description.trim(),
      photos,
      contact: form.contact.trim(),
    };

    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = "Submission failed";

        try {
          const errorResponse = (await response.json()) as SubmissionErrorResponse;
          if (errorResponse.error) {
            message = errorResponse.error;
          }
        } catch {
          message = "Submission failed";
        }

        throw new Error(message);
      }

      setIsSubmitted(true);
      setForm(createEmptySubmissionForm());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to submit your asset"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return <SubmissionSuccessState onReset={resetForm} />;
  }

  return (
    <Card className="border-white/10 bg-dark-800/90 text-white shadow-2xl shadow-black/20">
      <CardHeader className="px-8 pt-8">
        <CardTitle className="text-2xl text-white">Submit now</CardTitle>
        <CardDescription className="text-sm leading-6 text-gray-400">
          This intake form does not require a connected wallet. Share enough proof
          for the review team to verify the asset and reach you directly.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-8 pb-8">
        {errorMessage ? (
          <div className="mb-6">
            <InlineMessage tone="error">{errorMessage}</InlineMessage>
          </div>
        ) : null}

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <FieldLabel htmlFor="submission-name">
              Item name <span className="text-red-400">*</span>
            </FieldLabel>
            <Input
              className={inputClassName}
              id="submission-name"
              maxLength={MAX_SUBMISSION_NAME_LENGTH}
              name="name"
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="e.g. Vintage Rolex Submariner"
              required
              value={form.name}
            />
          </div>

          <div>
            <FieldLabel htmlFor="submission-category">
              Category <span className="text-red-400">*</span>
            </FieldLabel>
            <Select
              value={form.category}
              onValueChange={(value) => value && updateField("category", value)}
            >
              <SelectTrigger
                className="h-11 w-full border-white/10 bg-dark-900/70 px-4 text-white"
                id="submission-category"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border border-white/10 bg-dark-800 text-white">
                {submissionCategories.map((category) => (
                  <SelectItem
                    key={category}
                    className="focus:bg-white/10 focus:text-white"
                    value={category}
                  >
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <FieldLabel htmlFor="submission-description">
              Description <span className="text-red-400">*</span>
            </FieldLabel>
            <Textarea
              className={textareaClassName}
              id="submission-description"
              maxLength={MAX_SUBMISSION_DESCRIPTION_LENGTH}
              name="description"
              onChange={(event) => updateField("description", event.target.value)}
              placeholder="Describe the asset, condition, provenance, serial details, packaging, and anything else that will help verification."
              required
              rows={5}
              value={form.description}
            />
            <p className="mt-1.5 text-xs text-gray-500">
              {form.description.length}/{MAX_SUBMISSION_DESCRIPTION_LENGTH} characters
            </p>
          </div>

          <div>
            <FieldLabel htmlFor="submission-photo-0">
              Photo URLs <span className="text-red-400">*</span>
            </FieldLabel>
            <p className="mb-3 text-xs leading-5 text-gray-500">
              Provide up to five `https://` or `http://` image links. At least one is
              required.
            </p>
            <div className="space-y-3">
              {form.photos.map((photo, index) => (
                <Input
                  key={`submission-photo-${index}`}
                  className={inputClassName}
                  id={`submission-photo-${index}`}
                  name={`photo-${index + 1}`}
                  onChange={(event) => updatePhoto(index, event.target.value)}
                  placeholder={`Photo URL ${index + 1}${index === 0 ? "" : " (optional)"}`}
                  type="url"
                  value={photo}
                />
              ))}
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="submission-contact">
              Contact email or Telegram <span className="text-red-400">*</span>
            </FieldLabel>
            <Input
              className={inputClassName}
              id="submission-contact"
              maxLength={MAX_SUBMISSION_CONTACT_LENGTH}
              name="contact"
              onChange={(event) => updateField("contact", event.target.value)}
              placeholder="email@example.com or @telegram_username"
              required
              value={form.contact}
            />
          </div>

          <div className="space-y-4 pt-2">
            <p className="text-xs leading-5 text-gray-500">
              By submitting, you confirm that you have the right to share the asset
              details and supporting media. Review our <Link className="text-gold-300 underline underline-offset-4 hover:text-gold-200" href="/terms">Terms</Link> and <Link className="text-gold-300 underline underline-offset-4 hover:text-gold-200" href="/privacy">Privacy Policy</Link> before sending the intake.
            </p>

            <Button
              className="h-11 w-full bg-gold-500 text-dark-900 hover:bg-gold-400"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit asset"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}