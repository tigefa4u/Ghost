import NiceModal from '@ebay/nice-modal-react';

import WelcomeEmailEditorV2Exploration from './welcome-email-editor-v2-exploration';
import {Modal} from '@tryghost/admin-x-design-system';
import type {AutomatedEmail} from '@tryghost/admin-x-framework/api/automated-emails';

interface WelcomeEmailEditorV2ExplorationModalProps {
    emailType: 'free' | 'paid';
    automatedEmail: AutomatedEmail;
}

const WelcomeEmailEditorV2ExplorationModal = NiceModal.create<WelcomeEmailEditorV2ExplorationModalProps>(({automatedEmail}) => {
    const modal = NiceModal.useModal();

    return (
        <Modal
            afterClose={() => {
                modal.remove();
            }}
            footer={false}
            header={false}
            height='full'
            padding={false}
            size='lg'
            testId='welcome-email-v2-exploration-modal'
            width={1280}
        >
            <div className='h-full min-h-0'>
                <WelcomeEmailEditorV2Exploration automatedEmail={automatedEmail} onClose={() => modal.remove()} />
            </div>
        </Modal>
    );
});

export default WelcomeEmailEditorV2ExplorationModal;
