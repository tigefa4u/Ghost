import {Navigate} from "@tryghost/admin-x-framework";
import {useEffect, useRef, useState} from "react";
import {useOnboarding} from "@/onboarding/hooks/use-onboarding";

export default function SetupDoneRoute() {
    const onboarding = useOnboarding();
    const hasAttemptedChecklistStartRef = useRef(false);
    const [isStartingChecklist, setIsStartingChecklist] = useState(false);

    useEffect(() => {
        if (onboarding.checklistState !== "pending") {
            setIsStartingChecklist(false);
        }
    }, [onboarding.checklistState]);

    useEffect(() => {
        if (onboarding.isLoading || !onboarding.isOwner || onboarding.checklistState !== "pending" || hasAttemptedChecklistStartRef.current) {
            return;
        }

        hasAttemptedChecklistStartRef.current = true;
        setIsStartingChecklist(true);

        void onboarding.startChecklist().catch((error) => {
            setIsStartingChecklist(false);
            console.error(error);
        });
    }, [onboarding]);

    const shouldStartChecklist = onboarding.isOwner && onboarding.checklistState === "pending" && !hasAttemptedChecklistStartRef.current;

    if (onboarding.isLoading || isStartingChecklist || shouldStartChecklist) {
        return null;
    }

    if (!onboarding.shouldShowChecklist) {
        return <Navigate replace to="/analytics" />;
    }

    return <Navigate replace to="/setup/onboarding?returnTo=/analytics" />;
}
