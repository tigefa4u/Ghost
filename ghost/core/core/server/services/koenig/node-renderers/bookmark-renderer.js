const {addCreateDocumentOption} = require('../render-utils/add-create-document-option');
const {renderEmptyContainer} = require('../render-utils/render-empty-container');
const {escapeHtml} = require('../render-utils/escape-html');
const {truncateHtml} = require('../render-utils/truncate');

function renderBookmarkNode(node, options = {}) {
    addCreateDocumentOption(options);

    const document = options.createDocument();

    if (!node.url || node.url.trim() === '') {
        return renderEmptyContainer(document);
    }

    if (options.target === 'email') {
        return emailTemplate(node, document);
    } else {
        return frontendTemplate(node, document);
    }
}

function emailTemplate(node, document) {
    const title = escapeHtml(node.title);
    const publisher = escapeHtml(node.publisher);
    const author = escapeHtml(node.author);
    const description = escapeHtml(node.description);

    const icon = node.icon;
    const url = node.url;
    const thumbnail = node.thumbnail;
    const caption = node.caption;

    const element = document.createElement('div');

    const html =
        `
        <!--[if !mso !vml]-->
            <figure class="kg-card kg-bookmark-card ${caption ? `kg-card-hascaption` : ''}">
                <a class="kg-bookmark-container" href="${url}">
                    <div class="kg-bookmark-content">
                        <div class="kg-bookmark-title">${title}</div>
                        <div class="kg-bookmark-description">${truncateHtml(description, 120, 90)}</div>
                        <div class="kg-bookmark-metadata">
                            ${icon ? `<img class="kg-bookmark-icon" src="${icon}" alt="">` : ''}
                            ${publisher ? `<span class="kg-bookmark-author" src="${publisher}">${publisher}</span>` : ''}
                            ${author ? `<span class="kg-bookmark-publisher" src="${author}">${author}</span>` : ''}
                        </div>
                    </div>
                    ${thumbnail ? `<div class="kg-bookmark-thumbnail" style="background-image: url('${thumbnail}')">
                        <img src="${thumbnail}" alt="" onerror="this.style.display='none'"></div>` : ''}
                </a>
                ${caption ? `<figcaption>${caption}</figcaption>` : ''}
            </figure>
        <!--[endif]-->
        <!--[if vml]>
            <table class="kg-card kg-bookmark-card--outlook" style="margin: 0; padding: 0; width: 100%; border: 1px solid #e5eff5; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; border-collapse: collapse; border-spacing: 0;" width="100%">
                <tr>
                    <td width="100%" style="padding: 20px;">
                        <table style="margin: 0; padding: 0; border-collapse: collapse; border-spacing: 0;">
                            <tr>
                                <td class="kg-bookmark-title--outlook">
                                    <a href="${url}" style="text-decoration: none; color: #15212A; font-size: 15px; line-height: 1.5em; font-weight: 600;">
                                        ${title}
                                    </a>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <div class="kg-bookmark-description--outlook">
                                        <a href="${url}" style="text-decoration: none; margin-top: 12px; color: #738a94; font-size: 13px; line-height: 1.5em; font-weight: 400;">
                                            ${truncateHtml(description, 120, 90)}
                                        </a>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td class="kg-bookmark-metadata--outlook" style="padding-top: 14px; color: #15212A; font-size: 13px; font-weight: 400; line-height: 1.5em;">
                                    <table style="margin: 0; padding: 0; border-collapse: collapse; border-spacing: 0;">
                                        <tr>
                                            ${icon ? `
                                                <td valign="middle" class="kg-bookmark-icon--outlook" style="padding-right: 8px; font-size: 0; line-height: 1.5em;">
                                                    <a href="${url}" style="text-decoration: none; color: #15212A;">
                                                        <img src="${icon}" width="22" height="22" alt=" ">
                                                    </a>
                                                </td>
                                            ` : ''}
                                            <td valign="middle" class="kg-bookmark-byline--outlook">
                                                <a href="${url}" style="text-decoration: none; color: #15212A;">
                                                    ${publisher}
                                                    ${author ? `&nbsp;&#x2022;&nbsp;` : ''}
                                                    ${author}
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            <div class="kg-bookmark-spacer--outlook" style="height: 1.5em;">&nbsp;</div>
        <![endif]-->`;

    element.innerHTML = html;
    return {element};
}

function frontendTemplate(node, document) {
    const element = document.createElement('figure');
    const caption = node.caption;
    let cardClass = 'kg-card kg-bookmark-card';
    if (caption) {
        cardClass += ' kg-card-hascaption';
    }
    element.setAttribute('class', cardClass);

    const container = document.createElement('a');
    container.setAttribute('class','kg-bookmark-container');
    container.href = node.url;
    element.appendChild(container);

    const content = document.createElement('div');
    content.setAttribute('class','kg-bookmark-content');
    container.appendChild(content);

    const title = document.createElement('div');
    title.setAttribute('class','kg-bookmark-title');
    title.textContent = node.title;
    content.appendChild(title);

    const description = document.createElement('div');
    description.setAttribute('class','kg-bookmark-description');
    description.textContent = node.description;
    content.appendChild(description);

    const metadata = document.createElement('div');
    metadata.setAttribute('class','kg-bookmark-metadata');
    content.appendChild(metadata);

    metadata.icon = node.icon;
    if (metadata.icon) {
        const icon = document.createElement('img');
        icon.setAttribute('class','kg-bookmark-icon');
        icon.src = metadata.icon;
        icon.alt = '';
        metadata.appendChild(icon);
    }

    metadata.publisher = node.publisher;
    if (metadata.publisher) {
        const publisher = document.createElement('span');
        publisher.setAttribute('class','kg-bookmark-author'); // NOTE: This is NOT in error. The classes are reversed for theme backwards-compatibility.
        publisher.textContent = metadata.publisher;
        metadata.appendChild(publisher);
    }

    metadata.author = node.author;
    if (metadata.author) {
        const author = document.createElement('span');
        author.setAttribute('class','kg-bookmark-publisher'); // NOTE: This is NOT in error. The classes are reversed for theme backwards-compatibility.
        author.textContent = metadata.author;
        metadata.appendChild(author);
    }

    metadata.thumbnail = node.thumbnail;
    if (metadata.thumbnail) {
        const thumbnailDiv = document.createElement('div');
        thumbnailDiv.setAttribute('class','kg-bookmark-thumbnail');
        container.appendChild(thumbnailDiv);

        const thumbnail = document.createElement('img');
        thumbnail.src = metadata.thumbnail;
        thumbnail.alt = '';
        thumbnail.setAttribute('onerror',`this.style.display = 'none'`); // Hide thumbnail div if image fails to load
        thumbnailDiv.appendChild(thumbnail);
    }

    if (caption) {
        const figCaption = document.createElement('figcaption');
        figCaption.innerHTML = caption;
        element.appendChild(figCaption);
    }

    return {element};
}

module.exports = renderBookmarkNode;
