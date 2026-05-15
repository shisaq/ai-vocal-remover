import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'en' | 'zh-CN';

const STORAGE_KEY = 'ai-vocal-remover-locale';
const DEFAULT_LOCALE: Locale = 'en';

type Dict = Record<string, string>;

const en: Dict = {
  // Header / common
  'header.plan_free': '{used}/3 jobs this month',
  'header.plan_pro': 'High-fidelity mode',
  'header.plan_trial': 'Trial',
  'header.plan_free_label': 'Free',
  'header.plan_pro_monthly': 'Pro Monthly',
  'header.plan_pro_yearly': 'Pro Yearly',
  'header.unauth': 'Sign in',
  'header.pricing': 'Pricing',
  'header.history': 'History',
  'header.logout': 'Sign out',
  'header.manage_subscription': 'Manage subscription',
  'header.lang_switch': '中文',

  // Upload
  'upload.drop_hint_call': 'Drop your audio file',
  'upload.drop_hint_tail': 'here',
  'upload.drop_supports': 'Supports MP3, WAV (Max {max})',
  'upload.trial_note': "You have 1 free trial separation. Sign in for more.",
  'upload.url_placeholder': 'Paste a YouTube / Bilibili / Douyin / Xiaohongshu link',
  'upload.url_import': 'Import link',
  'upload.url_note': 'Lawful personal creative use only. If a platform blocks scraping, please upload the file manually.',
  'upload.start': 'Start extraction',

  // Progress
  'progress.status_label': 'Status',
  'progress.uploading': 'Uploading audio securely...',
  'progress.processing': 'Extracting stems using deep learning...',
  'progress.detail_connect_blob': 'Connecting to upload storage...',
  'progress.detail_direct_blob': 'Uploading directly to storage...',
  'progress.detail_fallback': 'Uploading through server fallback ({max} max)...',
  'progress.detail_saved_blob': 'Source audio uploaded.',
  'progress.detail_prepare': 'Preparing upload...',
  'progress.detail_url_fetch': 'Fetching link audio...',
  'progress.detail_start_modal': 'Starting separation job...',
  'progress.queued': 'Queued ({elapsed} elapsed)',
  'progress.separating': 'Separating vocals and accompaniment ({elapsed} elapsed)',
  'progress.encoding': 'Encoding and uploading results ({elapsed} elapsed)',
  'progress.almost': 'Almost done ({elapsed} elapsed)',

  // Result
  'result.complete': 'Separation complete',
  'result.expires': 'Result links expire in 30 minutes — download what you need now.',
  'result.finished': 'Finished',
  'result.accompaniment': 'Accompaniment',
  'result.download': 'Download',
  'result.process_another': 'Process another track',

  // Errors
  'error.title': 'Processing failed',
  'error.try_again': 'Try again',
  'error.invalid_file': 'Please upload a valid MP3 or WAV file.',
  'error.file_too_big': 'Please upload an audio file smaller than {max}.',
  'error.trial_used': 'You have used your free trial. Sign in to continue separating audio.',
  'error.must_sign_in_upgrade': 'Please sign in before upgrading.',
  'error.upload_timeout': 'Upload timed out before reaching storage. Please retry, or try a smaller audio file.',
  'error.fallback_too_big': 'Direct upload did not complete, and this file is too large for the server fallback. Please try a file under {max} or another browser.',
  'error.fallback_invalid_resp': 'Server fallback upload returned an invalid response.',
  'error.fallback_failed': 'Server fallback upload failed.',
  'error.fallback_network': 'Server fallback upload failed due to a network error.',
  'error.fallback_timeout': 'Server fallback upload timed out.',
  'error.process_failed': 'Failed to process audio.',
  'error.modal_failed': 'Separation processing failed.',
  'error.modal_timeout': 'Separation processing timed out after 15 minutes.',
  'error.url_import_failed': 'Link import failed. Please upload the file manually instead.',
  'error.unknown': 'Unknown error occurred.',
  'error.billing_portal': 'Failed to open billing portal.',

  // History
  'history.title': 'History',
  'history.refresh': 'Refresh',
  'history.empty': 'No previous jobs yet.',
  'history.unnamed': 'Untitled audio',
  'history.status.queued': 'Queued',
  'history.status.processing': 'Processing',
  'history.status.done': 'Done',
  'history.status.failed': 'Failed',
  'history.delete': 'Delete',
  'history.download_stem': 'Download {stem}',

  // Auth
  'auth.loading': 'Loading account...',
  'auth.panel_title': 'Sign in to unlock job history and plan quota',
  'auth.panel_subtitle': 'Unauthenticated users get 1 free trial. Real jobs are bound to your account.',
  'auth.email_placeholder': 'Email to sign in',
  'auth.send_link': 'Send link',
  'auth.google': 'Google',
  'auth.skip': 'Skip for now',
  'auth.link_sent': 'Magic link sent. Please check your inbox.',
  'auth.close_panel': 'Close sign-in panel',

  // Footer
  'footer.terms': 'Terms',
  'footer.privacy': 'Privacy',
  'footer.refund': 'Refund Policy',

  // Pricing page
  'pricing.title': 'Pricing',
  'pricing.description': 'Simple plans for creators who need clean vocals, accompaniment, drums, bass, and other stems for lawful personal creative use.',
  'pricing.free_name': 'Free',
  'pricing.free_price': '$0',
  'pricing.free_copy': '3 jobs per month, up to 5 minutes, up to 15 MB, vocals and accompaniment stems.',
  'pricing.start_free': 'Start free',
  'pricing.pro_monthly_name': 'Pro Monthly',
  'pricing.pro_monthly_price': '$4.99 / month',
  'pricing.pro_monthly_copy': 'Up to 15 minutes, up to 100 MB, 4-stem output, high-fidelity mode, 30-day history.',
  'pricing.pro_yearly_name': 'Pro Yearly',
  'pricing.pro_yearly_price': '$34.99 / year',
  'pricing.pro_yearly_copy': 'The same Pro features with annual billing and 90-day history retention.',
  'pricing.opening_checkout': 'Opening checkout...',
  'pricing.buy_with_paddle': 'Buy with Paddle',
  'pricing.unable_checkout': 'Unable to open checkout.',
  'pricing.included': 'Included',
  'pricing.included_1': 'Upload MP3/WAV audio or import supported public media links.',
  'pricing.included_2': 'Generate downloadable stems for cover songs, remix drafts, practice tracks, and short-form video creation.',
  'pricing.included_3': 'Temporary file processing with result links available for the retention period shown in the product.',
  'pricing.billing': 'Billing',
  'pricing.billing_copy': 'Paid subscriptions renew automatically unless canceled before the next billing date. Billing is processed by our payment provider. You can manage or cancel your subscription from the billing portal after purchase.',
  'pricing.billing_links': 'See our {terms}, {privacy}, and {refund} before purchasing.',

  // Compliance shell
  'page.back': 'Back to AI Vocal Remover',
  'page.last_updated': 'Last updated: {date}',
  'page.contact_prefix': 'Questions? Contact ',
  'page.contact_suffix': '.',

  // Terms
  'terms.title': 'Terms of Service',
  'terms.description': 'These terms explain how you may use AI Vocal Remover and what responsibilities apply when processing audio.',
  'terms.h1': '1. Service',
  'terms.p1': 'AI Vocal Remover provides online audio stem separation tools for creators. You may upload audio files or submit supported public media links to generate separated stems such as vocals, accompaniment, drums, bass, and other audio tracks.',
  'terms.h2': '2. Accounts',
  'terms.p2': 'You are responsible for keeping your account secure and for all activity under your account. We may limit, suspend, or terminate access if we detect abuse, fraud, excessive automated use, or violations of these terms.',
  'terms.h3': '3. Lawful Use and Copyright',
  'terms.p3': 'You may only process audio that you own, are licensed to use, or are otherwise legally permitted to process. The service is intended for lawful personal creative use, including cover practice, remix drafts, education, and short-form video creation. You are responsible for obtaining any permissions needed before publishing, distributing, monetizing, or commercially using generated stems.',
  'terms.h4': '4. Prohibited Use',
  'terms.p4_1': 'Do not use the service to infringe copyright or other rights.',
  'terms.p4_2': 'Do not upload illegal, harmful, or privacy-invasive content.',
  'terms.p4_3': 'Do not attempt to reverse engineer, overload, scrape, or disrupt the service.',
  'terms.p4_4': 'Do not resell the service or generated files as a standalone stem extraction service without permission.',
  'terms.h5': '5. Payments and Subscriptions',
  'terms.p5': 'Paid plans are billed according to the pricing shown at checkout. Subscriptions renew automatically unless canceled before renewal. Plan limits, file size limits, processing models, job retention, and concurrency may vary by plan.',
  'terms.h6': '6. Availability',
  'terms.p6': 'Audio processing depends on third-party infrastructure and model availability. We try to keep the service reliable, but we do not guarantee uninterrupted access or perfect separation quality for every audio file.',
  'terms.h7': '7. Limitation of Liability',
  'terms.p7': 'To the fullest extent allowed by law, AI Vocal Remover is provided as is. We are not liable for indirect damages, lost profits, lost data, copyright claims arising from your use of content, or losses beyond the amount you paid for the service in the previous month.',
  'terms.h8': '8. Contact',
  'terms.p8_prefix': 'For support, billing issues, or rights concerns, contact ',
  'terms.p8_suffix': '.',

  // Privacy
  'privacy.title': 'Privacy Policy',
  'privacy.description': 'This policy describes what data we collect, why we collect it, and how we handle uploaded audio and account data.',
  'privacy.h1': 'Information We Collect',
  'privacy.p1_1': 'Account information such as email address, login provider, plan, and subscription status.',
  'privacy.p1_2': 'Uploaded audio files, imported source URLs, filenames, generated stems, job status, and processing logs.',
  'privacy.p1_3': 'Payment and billing metadata from payment providers. We do not store full card numbers.',
  'privacy.p1_4': 'Usage analytics such as registration, upload, completion, and upgrade events.',
  'privacy.h2': 'How We Use Information',
  'privacy.p2': 'We use data to provide audio processing, enforce plan limits, maintain job history, process payments, prevent abuse, improve the product, and respond to support requests.',
  'privacy.h3': 'Audio Files',
  'privacy.p3': 'Source files are processed to generate stems and may be temporarily stored by our storage and processing providers. Result files are retained according to the plan and in-product retention period. You should not upload content that you are not legally permitted to process.',
  'privacy.h4': 'Service Providers',
  'privacy.p4': 'We rely on third-party providers for authentication, hosting, storage, analytics, payments, and audio processing. These providers process data only as needed to operate the service.',
  'privacy.h5': 'Your Choices',
  'privacy.p5': 'You may request deletion of your account or job history by contacting us. Some billing records may be retained where required for tax, fraud prevention, accounting, or legal compliance.',
  'privacy.h6': 'Contact',
  'privacy.p6_prefix': 'Privacy requests can be sent to ',
  'privacy.p6_suffix': '.',

  // Refund
  'refund.title': 'Refund Policy',
  'refund.description': 'This policy explains when refunds may be granted for AI Vocal Remover subscriptions and purchases.',
  'refund.h1': 'Summary',
  'refund.p1': 'AI Vocal Remover is a digital service that consumes processing resources when jobs are started. We review refund requests fairly, especially where a payment was accidental, duplicated, or the service failed to deliver usable access.',
  'refund.h2': 'Eligible Refunds',
  'refund.p2_1': 'Duplicate charges for the same account and billing period.',
  'refund.p2_2': 'Accidental purchase requests submitted within 7 days, provided the paid plan has not been substantially used.',
  'refund.p2_3': 'Technical failure where paid processing could not be completed and we cannot reasonably resolve the issue.',
  'refund.h3': 'Usually Not Refundable',
  'refund.p3_1': 'Completed audio jobs where stems were successfully generated and downloaded.',
  'refund.p3_2': 'Requests based only on dissatisfaction with the artistic quality of a specific source file.',
  'refund.p3_3': 'Subscription renewals not canceled before the renewal date, except where required by law.',
  'refund.p3_4': 'Use that violates our Terms of Service or copyright policy.',
  'refund.h4': 'How to Request a Refund',
  'refund.p4_prefix': 'Email ',
  'refund.p4_suffix': ' with your account email, payment date, order ID if available, and a short explanation. We usually respond within 5 business days.',
  'refund.h5': 'Cancellation',
  'refund.p5': 'You may cancel a subscription from the billing portal. Cancellation stops future renewals but does not automatically refund the current billing period unless this policy or applicable law requires it.',
};

const zhCN: Dict = {
  'header.plan_free': '本月 {used}/3 次',
  'header.plan_pro': '高保真模式',
  'header.plan_trial': '试用',
  'header.plan_free_label': '免费版',
  'header.plan_pro_monthly': 'Pro 月度',
  'header.plan_pro_yearly': 'Pro 年度',
  'header.unauth': '登录',
  'header.pricing': '套餐',
  'header.history': '历史记录',
  'header.logout': '退出登录',
  'header.manage_subscription': '管理订阅',
  'header.lang_switch': 'EN',

  'upload.drop_hint_call': '拖入音频文件',
  'upload.drop_hint_tail': '到此处',
  'upload.drop_supports': '支持 MP3、WAV（最大 {max}）',
  'upload.trial_note': '未登录可免费试用 1 次，登录后获得更多额度。',
  'upload.url_placeholder': '粘贴 B站 / 抖音 / 小红书 / YouTube 链接',
  'upload.url_import': '导入链接',
  'upload.url_note': '仅供个人合法创作使用；如平台限制抓取，请改用手动上传。',
  'upload.start': '开始分离',

  'progress.status_label': '状态',
  'progress.uploading': '正在安全上传音频...',
  'progress.processing': '正在使用深度学习模型分离音轨...',
  'progress.detail_connect_blob': '正在连接上传存储...',
  'progress.detail_direct_blob': '正在直接上传到存储...',
  'progress.detail_fallback': '正在通过服务器中转上传（上限 {max}）...',
  'progress.detail_saved_blob': '源音频上传完成。',
  'progress.detail_prepare': '准备上传...',
  'progress.detail_url_fetch': '正在抓取链接音频...',
  'progress.detail_start_modal': '正在启动分离任务...',
  'progress.queued': '排队中（已用 {elapsed}）',
  'progress.separating': '正在分离人声与伴奏（已用 {elapsed}）',
  'progress.encoding': '正在编码并上传结果（已用 {elapsed}）',
  'progress.almost': '即将完成（已用 {elapsed}）',

  'result.complete': '分离完成',
  'result.expires': '结果链接 30 分钟内有效，请尽快下载。',
  'result.finished': '已完成',
  'result.accompaniment': '伴奏',
  'result.download': '下载',
  'result.process_another': '处理下一首',

  'error.title': '处理失败',
  'error.try_again': '重试',
  'error.invalid_file': '请上传有效的 MP3 或 WAV 文件。',
  'error.file_too_big': '请上传小于 {max} 的音频文件。',
  'error.trial_used': '未登录试用额度已用完。请登录后继续分离更多音频。',
  'error.must_sign_in_upgrade': '请先登录，再升级套餐。',
  'error.upload_timeout': '上传超时未到达存储。请重试，或换更小的音频文件。',
  'error.fallback_too_big': '直传未完成，且文件过大无法走服务器中转。请改用小于 {max} 的文件或换浏览器。',
  'error.fallback_invalid_resp': '服务器中转上传返回无效响应。',
  'error.fallback_failed': '服务器中转上传失败。',
  'error.fallback_network': '服务器中转上传因网络错误失败。',
  'error.fallback_timeout': '服务器中转上传超时。',
  'error.process_failed': '音频处理失败。',
  'error.modal_failed': '分离处理失败。',
  'error.modal_timeout': '分离处理超过 15 分钟，已超时。',
  'error.url_import_failed': '链接导入失败，请改用手动上传。',
  'error.unknown': '发生未知错误。',
  'error.billing_portal': '无法打开账单门户。',

  'history.title': '历史记录',
  'history.refresh': '刷新',
  'history.empty': '暂无历史任务。',
  'history.unnamed': '未命名音频',
  'history.status.queued': '排队中',
  'history.status.processing': '处理中',
  'history.status.done': '已完成',
  'history.status.failed': '失败',
  'history.delete': '删除',
  'history.download_stem': '下载 {stem}',

  'auth.loading': '正在载入账号状态...',
  'auth.panel_title': '登录后解锁任务历史与套餐额度',
  'auth.panel_subtitle': '未登录可试用 1 次，正式分离任务会绑定到你的账号。',
  'auth.email_placeholder': '邮箱登录',
  'auth.send_link': '发送链接',
  'auth.google': 'Google',
  'auth.skip': '暂不登录',
  'auth.link_sent': '登录链接已发送，请检查邮箱。',
  'auth.close_panel': '关闭登录面板',

  'footer.terms': '服务条款',
  'footer.privacy': '隐私政策',
  'footer.refund': '退款政策',

  'pricing.title': '套餐价格',
  'pricing.description': '为需要清晰人声、伴奏、鼓、贝斯等分轨的创作者准备的简单套餐，适用于合法的个人创作用途。',
  'pricing.free_name': '免费版',
  'pricing.free_price': '$0',
  'pricing.free_copy': '每月 3 次，单次最长 5 分钟，最大 15 MB，人声与伴奏两个分轨。',
  'pricing.start_free': '免费开始',
  'pricing.pro_monthly_name': 'Pro 月度',
  'pricing.pro_monthly_price': '$4.99 / 月',
  'pricing.pro_monthly_copy': '单次最长 15 分钟，最大 100 MB，4 分轨输出，高保真模式，历史保留 30 天。',
  'pricing.pro_yearly_name': 'Pro 年度',
  'pricing.pro_yearly_price': '$34.99 / 年',
  'pricing.pro_yearly_copy': '与 Pro 月度功能相同，按年付费，历史保留 90 天。',
  'pricing.opening_checkout': '正在打开结账...',
  'pricing.buy_with_paddle': '使用 Paddle 购买',
  'pricing.unable_checkout': '无法打开结账。',
  'pricing.included': '套餐包含',
  'pricing.included_1': '上传 MP3/WAV 音频，或通过支持的公开媒体链接导入。',
  'pricing.included_2': '生成可下载的分轨，用于翻唱、混音草稿、练习伴奏、短视频创作等。',
  'pricing.included_3': '临时文件处理，结果链接在产品中显示的保留期内有效。',
  'pricing.billing': '账单',
  'pricing.billing_copy': '付费订阅会在下一个账单日自动续费，除非在续费前取消。账单由我们的支付服务商处理。购买后你可以在账单门户中管理或取消订阅。',
  'pricing.billing_links': '购买前请阅读{terms}、{privacy}和{refund}。',

  'page.back': '返回 AI Vocal Remover',
  'page.last_updated': '更新于：{date}',
  'page.contact_prefix': '有疑问？请联系 ',
  'page.contact_suffix': '。',

  'terms.title': '服务条款',
  'terms.description': '本条款说明你可以如何使用 AI Vocal Remover，以及处理音频时需要承担的责任。',
  'terms.h1': '1. 服务',
  'terms.p1': 'AI Vocal Remover 为创作者提供在线音频分轨工具。你可以上传音频文件或提交受支持的公开媒体链接，生成人声、伴奏、鼓、贝斯等分离后的音轨。',
  'terms.h2': '2. 账号',
  'terms.p2': '你需自行保管账号安全，并对账号下的所有活动负责。如检测到滥用、欺诈、过度自动化使用或违反本条款的行为，我们可能限制、暂停或终止你的访问权限。',
  'terms.h3': '3. 合法使用与版权',
  'terms.p3': '你只能处理自己拥有版权、已获授权或在法律允许范围内可以处理的音频。本服务面向合法的个人创作用途，包括翻唱练习、混音草稿、教育和短视频创作。在发布、分发、变现或商业使用生成的分轨之前，你需自行获得必要的授权。',
  'terms.h4': '4. 禁止行为',
  'terms.p4_1': '不得使用本服务侵犯版权或其他权利。',
  'terms.p4_2': '不得上传违法、有害或侵犯隐私的内容。',
  'terms.p4_3': '不得尝试逆向工程、超载、爬取或破坏本服务。',
  'terms.p4_4': '未经许可，不得将本服务或生成文件作为独立的分轨提取服务转售。',
  'terms.h5': '5. 支付与订阅',
  'terms.p5': '付费套餐按结账时显示的价格计费。订阅会自动续费，除非在续费前取消。不同套餐的额度、文件大小限制、处理模型、历史保留与并发数可能不同。',
  'terms.h6': '6. 可用性',
  'terms.p6': '音频处理依赖第三方基础设施和模型可用性。我们会努力保持服务稳定，但不保证不间断的访问，也不保证对每一个音频都能得到完美的分离效果。',
  'terms.h7': '7. 责任限制',
  'terms.p7': '在法律允许的最大范围内，AI Vocal Remover 按"现状"提供。我们不对间接损害、利润损失、数据损失、因你使用内容而产生的版权索赔，或超过过去一个月你为本服务支付金额的损失承担责任。',
  'terms.h8': '8. 联系方式',
  'terms.p8_prefix': '支持、账单或权利相关问题，请联系 ',
  'terms.p8_suffix': '。',

  'privacy.title': '隐私政策',
  'privacy.description': '本政策说明我们收集哪些数据、为何收集，以及如何处理上传的音频与账户数据。',
  'privacy.h1': '我们收集的信息',
  'privacy.p1_1': '账户信息，例如邮箱地址、登录提供商、套餐和订阅状态。',
  'privacy.p1_2': '上传的音频文件、导入的源链接、文件名、生成的分轨、任务状态和处理日志。',
  'privacy.p1_3': '来自支付服务商的支付与账单元数据。我们不存储完整的卡号。',
  'privacy.p1_4': '使用分析事件，例如注册、上传、完成和升级。',
  'privacy.h2': '我们如何使用信息',
  'privacy.p2': '我们使用数据来提供音频处理、执行套餐额度、维护任务历史、处理支付、防止滥用、改进产品以及响应支持请求。',
  'privacy.h3': '音频文件',
  'privacy.p3': '源文件用于生成分轨，可能会被我们的存储和处理服务商临时存储。结果文件会按照套餐和产品内显示的保留期保留。请不要上传你无权处理的内容。',
  'privacy.h4': '服务提供商',
  'privacy.p4': '我们依赖第三方服务商提供身份验证、托管、存储、分析、支付和音频处理。这些服务商仅在运营本服务所必需的范围内处理数据。',
  'privacy.h5': '你的选择',
  'privacy.p5': '你可以通过联系我们请求删除账户或任务历史。出于税务、防欺诈、会计或法律合规需要，部分账单记录可能会被保留。',
  'privacy.h6': '联系方式',
  'privacy.p6_prefix': '隐私请求可发送至 ',
  'privacy.p6_suffix': '。',

  'refund.title': '退款政策',
  'refund.description': '本政策说明在何种情况下可以为 AI Vocal Remover 的订阅和购买申请退款。',
  'refund.h1': '概述',
  'refund.p1': 'AI Vocal Remover 是一项数字服务，任务启动时会消耗处理资源。我们会公平审查退款请求，尤其是误付、重复付费或服务未能提供可用访问的情况。',
  'refund.h2': '可退款情形',
  'refund.p2_1': '同一账户在同一账单周期内的重复扣款。',
  'refund.p2_2': '在 7 天内提交的误购请求，且付费套餐尚未被显著使用。',
  'refund.p2_3': '付费处理因技术故障无法完成，且我们无法合理解决该问题。',
  'refund.h3': '通常不予退款',
  'refund.p3_1': '已成功生成并下载分轨的已完成任务。',
  'refund.p3_2': '仅基于对特定源文件分离效果不满意的请求。',
  'refund.p3_3': '未在续费日期之前取消的订阅续费，除非法律另有规定。',
  'refund.p3_4': '违反我们的服务条款或版权政策的使用。',
  'refund.h4': '如何申请退款',
  'refund.p4_prefix': '发送邮件到 ',
  'refund.p4_suffix': '，附上你的账户邮箱、付款日期、订单号（如有）和简短说明。我们通常在 5 个工作日内回复。',
  'refund.h5': '取消订阅',
  'refund.p5': '你可以在账单门户中取消订阅。取消会停止后续续费，但不会自动退还当前账单周期的费用，除非本政策或适用法律另有要求。',
};

const dictionaries: Record<Locale, Dict> = {
  en,
  'zh-CN': zhCN,
};

type Translator = (key: string, params?: Record<string, string | number>) => string;

type LanguageContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: Translator;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh-CN') {
      return stored;
    }
  } catch {
    // localStorage may throw in private mode; fall through.
  }

  return DEFAULT_LOCALE;
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en';
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // ignore storage failure
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const t = useCallback<Translator>(
    (key, params) => {
      const dict = dictionaries[locale];
      const fallback = dictionaries.en;
      const template = dict[key] ?? fallback[key] ?? key;

      return interpolate(template, params);
    },
    [locale],
  );

  const value = useMemo<LanguageContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used inside <LanguageProvider>');
  }

  return ctx;
}

export function useT() {
  return useLanguage().t;
}
