import { t } from "@lingui/core/macro";
import { HiOutlineChatBubbleLeftRight } from "react-icons/hi2";

import Button from "~/components/Button";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

export default function CrikketReporterFollowUpButton({
  cardPublicId,
  disabled,
}: {
  cardPublicId: string;
  disabled?: boolean;
}) {
  const { openModal } = useModal();
  const { showPopup } = usePopup();

  const { data, isLoading } = api.crikket.getFeatureRequestByCard.useQuery(
    { cardPublicId },
    {
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  if (isLoading || !data?.linked) {
    return null;
  }

  const handleClick = () => {
    if (!data.hasReporterEmail) {
      showPopup({
        header: t`Keine Melder-E-Mail`,
        message: t`Für diesen Feature Request ist keine E-Mail-Adresse des Melders hinterlegt.`,
        icon: "error",
      });
      return;
    }

    openModal("CRIKKET_REPORTER_FOLLOW_UP");
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={disabled}
      onClick={handleClick}
      className="whitespace-nowrap"
    >
      <HiOutlineChatBubbleLeftRight className="mr-1.5 h-4 w-4" />
      {t`Rückfrage an Melder`}
    </Button>
  );
}
