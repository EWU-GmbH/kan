import { t } from "@lingui/core/macro";
import { useForm } from "react-hook-form";
import { HiXMark } from "react-icons/hi2";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

interface ReporterFollowUpFormInput {
  message: string;
}

export default function CrikketReporterFollowUpModal({
  cardPublicId,
}: {
  cardPublicId: string;
}) {
  const { closeModal } = useModal();
  const { showPopup } = usePopup();

  const { handleSubmit, setValue, watch, reset } =
    useForm<ReporterFollowUpFormInput>({
      defaultValues: {
        message: "",
      },
    });

  const sendFollowUp = api.crikket.sendReporterFollowUp.useMutation({
    onSuccess: () => {
      reset();
      closeModal();
      showPopup({
        header: t`Rückfrage gesendet`,
        message: t`Der Melder wurde per E-Mail benachrichtigt.`,
        icon: "success",
      });
    },
    onError: (error) => {
      showPopup({
        header: t`Rückfrage fehlgeschlagen`,
        message:
          error.message ||
          t`Bitte später erneut versuchen oder den Support kontaktieren.`,
        icon: "error",
      });
    },
  });

  const onSubmit = (values: ReporterFollowUpFormInput) => {
    sendFollowUp.mutate({
      cardPublicId,
      message: values.message,
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="px-5 pt-5">
        <div className="flex w-full items-center justify-between pb-4">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-dark-1000">
            {t`Rückfrage an Melder`}
          </h2>
          <button
            type="button"
            className="rounded p-1 hover:bg-light-200 focus:outline-none dark:hover:bg-dark-300"
            onClick={(e) => {
              e.preventDefault();
              closeModal();
            }}
          >
            <HiXMark size={18} className="text-light-900 dark:text-dark-900" />
          </button>
        </div>

        <p className="mb-3 text-sm text-light-800 dark:text-dark-800">
          {t`Ihre Nachricht wird per E-Mail an den Melder des Feature Requests gesendet.`}
        </p>

        <Input
          id="message"
          placeholder={t`Ihre Rückfrage…`}
          onChange={(e) => setValue("message", e.target.value)}
          contentEditable
          value={watch("message")}
          className="min-h-[120px]"
          disabled={sendFollowUp.isPending}
        />
      </div>

      <div className="flex justify-end gap-2 px-5 pb-5 pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => closeModal()}
          disabled={sendFollowUp.isPending}
        >
          {t`Cancel`}
        </Button>
        <Button
          type="submit"
          disabled={sendFollowUp.isPending || !watch("message").trim()}
        >
          {sendFollowUp.isPending ? t`Sending…` : t`Senden`}
        </Button>
      </div>
    </form>
  );
}
