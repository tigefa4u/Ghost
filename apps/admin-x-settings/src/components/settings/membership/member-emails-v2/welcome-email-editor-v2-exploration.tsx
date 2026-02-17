import React, {useEffect, useMemo, useState} from 'react';

import {Button, ButtonGroup, ColorPickerField, Form, Heading, Hint, Icon, ImageUpload, PageHeader, Select, type SelectOption, Separator, type Tab, TabView, Toggle, ToggleGroup} from '@tryghost/admin-x-design-system';
import {getSettingValues} from '@tryghost/admin-x-framework/api/settings';
import {useBrowseAutomatedEmails} from '@tryghost/admin-x-framework/api/automated-emails';
import {useRouting} from '@tryghost/admin-x-framework/routing';

import MemberEmailEditor from '../member-emails/member-email-editor';
import {useGlobalData} from '../../../providers/global-data-provider';
import type {AutomatedEmail} from '@tryghost/admin-x-framework/api/automated-emails';

const FALLBACK_LEXICAL_CONTENT = '{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Welcome! Thanks for subscribing — it\'s great to have you here.","type":"extended-text","version":1}],"direction":"ltr","format":"","indent":0,"type":"paragraph","version":1},{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"You\'ll now receive new posts straight to your inbox.","type":"extended-text","version":1}],"direction":"ltr","format":"","indent":0,"type":"paragraph","version":1}],"direction":"ltr","format":"","indent":0,"type":"root","version":1}}';

type MainTab = 'body' | 'design';
type SettingsTab = 'content' | 'design';

interface WelcomeEmailEditorV2ExplorationProps {
    automatedEmail?: AutomatedEmail;
    onClose?: () => void;
}

const WelcomeEmailEditorV2Exploration: React.FC<WelcomeEmailEditorV2ExplorationProps> = ({
    automatedEmail: automatedEmailProp,
    onClose
}) => {
    const {updateRoute} = useRouting();
    const {settings} = useGlobalData();
    const [siteTitle, defaultEmailAddress] = getSettingValues<string>(settings, ['title', 'default_email_address']);
    const {data: automatedEmailsData} = useBrowseAutomatedEmails();

    const [mainTab, setMainTab] = useState<MainTab>('body');
    const [settingsTab, setSettingsTab] = useState<SettingsTab>('content');

    const fetchedAutomatedEmail = useMemo(() => {
        const emails = automatedEmailsData?.automated_emails || [];
        return emails.find(email => email.slug === 'member-welcome-email-free') ||
            emails.find(email => email.slug === 'member-welcome-email-paid') ||
            emails[0];
    }, [automatedEmailsData]);

    const automatedEmail = automatedEmailProp || fetchedAutomatedEmail;

    const [lexical, setLexical] = useState(FALLBACK_LEXICAL_CONTENT);

    useEffect(() => {
        if (automatedEmail?.lexical) {
            setLexical(automatedEmail.lexical);
        }
    }, [automatedEmail?.lexical]);

    const senderName = automatedEmail?.sender_name || siteTitle || 'Your site';
    const senderEmail = automatedEmail?.sender_email || defaultEmailAddress || 'newsletter@example.com';
    const subject = automatedEmail?.subject || `Welcome to ${siteTitle || 'your site'}`;

    const fontOptions: SelectOption[] = [
        {value: 'serif', label: 'Elegant serif', className: 'font-serif'},
        {value: 'sans_serif', label: 'Clean sans-serif'}
    ];

    const headingFontWeightOptions: SelectOption[] = [
        {value: 'normal', label: 'Regular', className: 'font-normal'},
        {value: 'bold', label: 'Bold', className: 'font-bold'}
    ];

    const noOp = () => {};
    const noOpAsync = async () => '';

    const staticDesignValues = {
        showHeaderIcon: true,
        showHeaderTitle: true,
        showHeaderName: true,
        showPostTitleSection: true,
        showExcerpt: true,
        showFeatureImage: true,
        feedbackEnabled: true,
        showCommentCta: true,
        showLatestPosts: true,
        showSubscriptionDetails: true,
        showBadge: true,
        titleFontCategory: 'serif',
        titleFontWeight: 'bold',
        bodyFontCategory: 'sans_serif',
        backgroundColor: 'light',
        headerBackgroundColor: 'transparent',
        postTitleColor: null,
        titleAlignment: 'left',
        sectionTitleColor: null,
        buttonColor: 'accent',
        buttonStyle: 'fill',
        buttonCorners: 'rounded',
        linkColor: 'accent',
        linkStyle: 'underline',
        imageCorners: 'square',
        dividerColor: 'light',
        footerContent: '<p>Thanks for reading.</p>'
    } as const;

    const tabs: Tab[] = [
        {
            id: 'content',
            title: 'Content',
            contents: (
                <>
                    <Form className='mt-6' gap='sm' margins='lg' title='Header'>
                        <div>
                            <div>
                                <Heading className="mb-2" level={6}>Header image</Heading>
                            </div>
                            <div className='flex-column flex gap-1'>
                                <ImageUpload
                                    deleteButtonClassName='!top-1 !right-1'
                                    height='66px'
                                    id='welcome-email-header-image'
                                    imageURL='https://static.ghost.org/v5.0.0/images/welcome-to-ghost.png'
                                    onDelete={noOp}
                                    onUpload={noOpAsync}
                                >
                                    <Icon colorClass='text-grey-700 dark:text-grey-300' name='picture' />
                                </ImageUpload>
                                <Hint>1200x600 recommended. Use a transparent PNG for best results on any background.</Hint>
                            </div>
                        </div>
                        <ToggleGroup>
                            <Toggle
                                checked={staticDesignValues.showHeaderIcon}
                                direction="rtl"
                                label='Publication icon'
                                onChange={noOp}
                            />
                            <Toggle
                                checked={staticDesignValues.showHeaderTitle}
                                direction="rtl"
                                label='Publication title'
                                onChange={noOp}
                            />
                        </ToggleGroup>
                    </Form>

                    <Separator />
                </>
            )
        },
        {
            id: 'design',
            title: 'Design',
            contents: (
                <>
                    <Form className='mt-6' gap='xs' margins='lg' title='Global'>
                        <div className='mb-1'>
                            <ColorPickerField
                                direction='rtl'
                                eyedropper={true}
                                swatches={[
                                    {
                                        hex: '#ffffff',
                                        value: 'light',
                                        title: 'White'
                                    }
                                ]}
                                title='Background color'
                                value={staticDesignValues.backgroundColor}
                                onChange={noOp}
                            />
                        </div>
                        <div className='flex w-full items-center justify-between gap-2'>
                            <div className='shrink-0'>Heading font</div>
                            <Select
                                containerClassName='max-w-[200px]'
                                options={fontOptions}
                                selectedOption={fontOptions.find(option => option.value === staticDesignValues.titleFontCategory)}
                                onSelect={noOp}
                            />
                        </div>
                        <div className='flex w-full items-center justify-between gap-2'>
                            <div className='shrink-0'>Heading weight</div>
                            <Select
                                containerClassName='max-w-[200px]'
                                options={headingFontWeightOptions}
                                selectedOption={headingFontWeightOptions.find(option => option.value === staticDesignValues.titleFontWeight)}
                                onSelect={noOp}
                            />
                        </div>
                        <div className='flex w-full items-center justify-between gap-2'>
                            <div className='shrink-0'>Body font</div>
                            <Select
                                containerClassName='max-w-[200px]'
                                options={fontOptions}
                                selectedOption={fontOptions.find(option => option.value === staticDesignValues.bodyFontCategory)}
                                onSelect={noOp}
                            />
                        </div>
                    </Form>

                    <Form className='mt-6' gap='xs' margins='lg' title='Header'>
                        <div className='mb-1'>
                            <ColorPickerField
                                direction='rtl'
                                eyedropper={true}
                                swatches={[
                                    {
                                        value: 'transparent',
                                        title: 'Transparent',
                                        hex: '#00000000'
                                    }
                                ]}
                                title='Header background color'
                                value={staticDesignValues.headerBackgroundColor}
                                onChange={noOp}
                            />
                        </div>
                        <div className='mb-1'>
                            <ColorPickerField
                                direction='rtl'
                                eyedropper={true}
                                swatches={[
                                    {
                                        value: null,
                                        title: 'Auto',
                                        hex: '#000000'
                                    },
                                    {
                                        value: 'accent',
                                        title: 'Accent',
                                        hex: '#f14141'
                                    }
                                ]}
                                title='Post title color'
                                value={staticDesignValues.postTitleColor}
                                onChange={noOp}
                            />
                        </div>
                        <div className='flex w-full justify-between'>
                            <div>Title alignment</div>
                            <ButtonGroup activeKey={staticDesignValues.titleAlignment} buttons={[
                                {
                                    key: 'left',
                                    icon: 'align-left',
                                    iconSize: 14,
                                    label: 'Align left',
                                    tooltip: 'Left',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: noOp
                                },
                                {
                                    key: 'center',
                                    icon: 'align-center',
                                    iconSize: 14,
                                    label: 'Align center',
                                    tooltip: 'Center',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: noOp
                                }
                            ]} clearBg={false} />
                        </div>
                    </Form>

                    <Form className='mt-6' gap='xs' margins='lg' title='Body'>
                        <div className='mb-1'>
                            <ColorPickerField
                                direction='rtl'
                                eyedropper={true}
                                swatches={[
                                    {
                                        value: null,
                                        title: 'Auto',
                                        hex: '#000000'
                                    },
                                    {
                                        value: 'accent',
                                        title: 'Accent',
                                        hex: '#f14141'
                                    }
                                ]}
                                title='Section title color'
                                value={staticDesignValues.sectionTitleColor}
                                onChange={noOp}
                            />
                        </div>
                        <div className='mb-1'>
                            <ColorPickerField
                                direction='rtl'
                                eyedropper={true}
                                swatches={[
                                    {
                                        value: 'accent',
                                        title: 'Accent',
                                        hex: '#f14141'
                                    },
                                    {
                                        value: null,
                                        title: 'Auto',
                                        hex: '#000000'
                                    }
                                ]}
                                title='Button color'
                                value={staticDesignValues.buttonColor}
                                onChange={noOp}
                            />
                        </div>
                        <div className='flex w-full justify-between'>
                            <div>Button style</div>
                            <ButtonGroup activeKey={staticDesignValues.buttonStyle} buttons={[
                                {
                                    key: 'fill',
                                    icon: 'squircle-fill',
                                    iconSize: 14,
                                    label: 'Fill',
                                    tooltip: 'Fill',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: noOp
                                },
                                {
                                    key: 'outline',
                                    icon: 'squircle',
                                    iconSize: 14,
                                    label: 'Outline',
                                    tooltip: 'Outline',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: noOp
                                }
                            ]} clearBg={false} />
                        </div>
                        <div className='flex w-full justify-between'>
                            <div>Button corners</div>
                            <ButtonGroup activeKey={staticDesignValues.buttonCorners} buttons={[
                                {
                                    key: 'square',
                                    icon: 'square',
                                    iconSize: 14,
                                    label: 'Square',
                                    tooltip: 'Squared',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: noOp
                                },
                                {
                                    key: 'rounded',
                                    icon: 'squircle',
                                    iconSize: 14,
                                    label: 'Rounded',
                                    tooltip: 'Rounded',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: noOp
                                },
                                {
                                    key: 'pill',
                                    icon: 'circle',
                                    iconSize: 14,
                                    label: 'Pill',
                                    tooltip: 'Pill',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: noOp
                                }
                            ]} clearBg={false} />
                        </div>
                        <div className='mb-1'>
                            <ColorPickerField
                                direction='rtl'
                                eyedropper={true}
                                swatches={[
                                    {
                                        value: 'accent',
                                        title: 'Accent',
                                        hex: '#f14141'
                                    },
                                    {
                                        value: null,
                                        title: 'Auto',
                                        hex: '#000000'
                                    }
                                ]}
                                title='Link color'
                                value={staticDesignValues.linkColor}
                                onChange={noOp}
                            />
                        </div>
                        <div className='flex w-full justify-between'>
                            <div>Link style</div>
                            <ButtonGroup activeKey={staticDesignValues.linkStyle} buttons={[
                                {
                                    key: 'underline',
                                    icon: 'text-underline',
                                    iconSize: 14,
                                    label: 'Underline',
                                    tooltip: 'Underline',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: noOp
                                },
                                {
                                    key: 'regular',
                                    icon: 'text-regular',
                                    iconSize: 14,
                                    label: 'Regular',
                                    tooltip: 'Regular',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: noOp
                                },
                                {
                                    key: 'bold',
                                    icon: 'text-bold',
                                    iconSize: 14,
                                    label: 'Bold',
                                    tooltip: 'Bold',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: noOp
                                }
                            ]} clearBg={false} />
                        </div>
                        <div className='flex w-full justify-between'>
                            <div>Image corners</div>
                            <ButtonGroup activeKey={staticDesignValues.imageCorners} buttons={[
                                {
                                    key: 'square',
                                    icon: 'square',
                                    iconSize: 14,
                                    label: 'Square',
                                    tooltip: 'Squared',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: noOp
                                },
                                {
                                    key: 'rounded',
                                    icon: 'squircle',
                                    iconSize: 14,
                                    label: 'Rounded',
                                    tooltip: 'Rounded',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: noOp
                                }
                            ]} clearBg={false} />
                        </div>
                        <div className='mb-1'>
                            <ColorPickerField
                                direction='rtl'
                                eyedropper={true}
                                swatches={[
                                    {
                                        value: 'light',
                                        title: 'Light',
                                        hex: '#e0e7eb'
                                    },
                                    {
                                        value: 'accent',
                                        title: 'Accent',
                                        hex: '#f14141'
                                    }
                                ]}
                                title='Divider color'
                                value={staticDesignValues.dividerColor}
                                onChange={noOp}
                            />
                        </div>
                    </Form>
                </>
            )
        }
    ];

    const leftHeader = <h2 className='text-[20px] font-semibold tracking-tight'>Welcome email</h2>;
    const centerHeader = (
        <div className='flex h-9 items-center gap-0.5 rounded-lg bg-grey-100 p-0.5 dark:bg-grey-950'>
            <button
                className={`min-w-[140px] rounded-md px-3 py-2 text-[13px] font-semibold ${mainTab === 'body' ? 'bg-white text-black shadow-sm dark:bg-grey-900 dark:text-white' : 'text-grey-700 dark:text-grey-500'}`}
                type='button'
                onClick={() => setMainTab('body')}
            >
                Email body
            </button>
            <button
                className={`min-w-[140px] rounded-md px-3 py-2 text-[13px] font-semibold ${mainTab === 'design' ? 'bg-white text-black shadow-sm dark:bg-grey-900 dark:text-white' : 'text-grey-700 dark:text-grey-500'}`}
                type='button'
                onClick={() => setMainTab('design')}
            >
                Preview & settings
            </button>
        </div>
    );
    const rightHeader = (
        <div className='flex items-center gap-2'>
            <Button
                className='border border-grey-200 font-semibold hover:border-grey-300 dark:border-grey-900 dark:hover:border-grey-800'
                color='clear'
                label='Close'
                onClick={() => {
                    if (onClose) {
                        onClose();
                        return;
                    }
                    updateRoute('memberemails');
                }}
            />
            <Button
                color='black'
                label='Save'
                onClick={() => {}}
            />
        </div>
    );

    return (
        <div className='flex h-full min-h-0 flex-col bg-grey-100 dark:bg-grey-975'>
            <PageHeader
                center={centerHeader}
                containerClassName='z-[60] h-[76px] min-h-[76px] border-b border-grey-200 bg-white px-7 py-0 dark:border-grey-900 dark:bg-black'
                left={leftHeader}
                right={rightHeader}
            />
            {mainTab === 'body' && (
                <div className='min-h-0 flex-1 overflow-y-auto bg-white dark:bg-black'>
                    <div className='mx-auto w-full max-w-[900px] p-10'>
                        <div className='p-12'>
                            <MemberEmailEditor
                                className='welcome-email-editor-v2'
                                placeholder='Write your welcome email content...'
                                value={lexical}
                                onChange={setLexical}
                            />
                        </div>
                    </div>
                </div>
            )}

            {mainTab === 'design' && (
                <div className='flex min-h-0 flex-1 overflow-hidden'>
                    <div className='min-h-0 flex-1 overflow-hidden bg-grey-100 px-8 py-14 dark:bg-grey-975'>
                        <div className='mx-auto size-full max-h-[822px] max-w-[700px] overflow-hidden rounded-t-xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.07),0_3px_7px_rgba(0,0,0,0.02)] dark:bg-grey-950'>
                            <div className='flex items-start justify-between px-6 py-4 text-[13px]'>
                                <div>
                                    <div className='font-semibold'>{senderName} <span className='font-normal text-grey-700 dark:text-grey-500'>- {senderEmail}</span></div>
                                    <div><span className='font-semibold'>To:</span> <span className='text-grey-700 dark:text-grey-500'>james@example.com</span></div>
                                    <div className='mt-1 font-semibold'>{subject}</div>
                                </div>
                                <Button
                                    className='font-semibold'
                                    color='clear'
                                    icon='send'
                                    label='Test'
                                    onClick={() => {}}
                                />
                            </div>
                            <div className='h-[calc(100%-70px)] overflow-y-auto border-t border-grey-200 bg-[#ebeff7] p-10 dark:border-grey-900'>
                                <div className='mx-auto max-w-[584px] space-y-7'>
                                    <div className='h-[122px] rounded bg-white/70' />
                                    <h3 className='font-serif text-[36px] font-bold leading-none tracking-tight text-black'>You&rsquo;re in!</h3>
                                    <p className='text-[17px] leading-relaxed text-black'>We&rsquo;re so glad you&rsquo;re here. By signing up, you&rsquo;ve joined a community that values stories, ideas, and honest voices.</p>
                                    <div className='flex justify-center'>
                                        <button className='h-11 rounded-[10px] bg-blue px-5 text-[14px] font-semibold text-white' type='button'>Start reading now &rarr;</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <aside className='min-h-0 w-[360px] overflow-y-auto border-l border-grey-200 bg-white py-8 dark:border-grey-900 dark:bg-black'>
                        <div className='px-7 pb-7'>
                            <TabView selectedTab={settingsTab} stickyHeader={true} tabs={tabs} onTabChange={(id: string) => setSettingsTab(id as SettingsTab)} />
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
};

export default WelcomeEmailEditorV2Exploration;
