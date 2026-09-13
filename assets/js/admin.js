jQuery(function ($) {
    'use strict';

    var i18n = (typeof wpStaticDeploy !== 'undefined' && wpStaticDeploy.i18n) ? wpStaticDeploy.i18n : {};

    // --- Tabs: Content / Navigation / Forms / Deployment target / -----
    // --- Markdown export --------------------------------------------------
    var $tabs = $('.wpstatic-tabs .nav-tab');
    var $panels = $('.wpstatic-tab-panel');
    var $transferSection = $('#wpstatic-transfer-section, #wpstatic-transfer-hr, #wpstatic-save-button-wrap');
    var STORAGE_KEY = 'wpstaticActiveTab';

    function activateTab(tabId) {
        if (!$panels.filter('[data-tab-panel="' + tabId + '"]').length) {
            return;
        }

        $tabs.removeClass('nav-tab-active');
        $tabs.filter('[data-tab="' + tabId + '"]').addClass('nav-tab-active');

        $panels.removeClass('wpstatic-tab-active');
        $panels.filter('[data-tab-panel="' + tabId + '"]').addClass('wpstatic-tab-active');

        // "Deployment" (Deploy all etc.) doesn't belong to the Markdown
        // export (which runs independently of SFTP/Netlify) - hide it
        // there so the Markdown section moves further up.
        $transferSection.toggle(tabId !== 'markdown');

        try {
            window.localStorage.setItem(STORAGE_KEY, tabId);
        } catch (e) {
            // localStorage may not be available (e.g. private browsing) - not a problem, only the "remember" feature is lost.
        }
    }

    if ($tabs.length) {
        $tabs.on('click', function (e) {
            e.preventDefault();
            activateTab($(this).data('tab'));
        });

        var savedTab = null;
        try {
            savedTab = window.localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            // ignore
        }

        activateTab(savedTab && $panels.filter('[data-tab-panel="' + savedTab + '"]').length ? savedTab : $tabs.first().data('tab'));
    }

    // --- Detecting unsaved changes ---------------------------------------
    // "Deploy all" and "Deploy assets only" read the last SAVED settings
    // from the database, not the current form values. Without this
    // warning, you could e.g. switch the target from Netlify to SFTP,
    // forget to save, and click "Deploy all" - which would then silently
    // run with the old Netlify settings.
    var $settingsForm = $('#wpstatic-settings-form');
    var $unsavedNotice = $('#wpstatic-unsaved-notice');
    var formDirty = false;

    if ($settingsForm.length) {
        $settingsForm.on('input change', 'input, textarea, select', function () {
            formDirty = true;
            $unsavedNotice.show();
        });

        $settingsForm.on('submit', function () {
            formDirty = false; // the page reloads afterwards anyway
        });
    }

    window.addEventListener('beforeunload', function (e) {
        if (formDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    /**
     * Shows a confirmation dialog if there are unsaved changes, before an
     * action runs that would instead use the saved settings. Returns
     * true if it's OK to proceed (no unsaved changes, or the user
     * confirmed proceeding anyway).
     */
    function confirmIfUnsaved(actionLabel) {
        if (!formDirty) {
            return true;
        }

        return window.confirm((i18n.unsavedChangesConfirm || '').replace('%s', actionLabel));
    }

    // --- Target switching (Netlify / SFTP) -------------------------------
    function updateTargetSections() {
        var target = $('.wpstatic-target-radio:checked').val();
        $('#wpstatic-target-netlify').toggle(target === 'netlify');
        $('#wpstatic-target-sftp').toggle(target === 'sftp');
    }

    function updateSftpAuthSections() {
        var method = $('.wpstatic-sftp-auth-radio:checked').val();
        $('.wpstatic-sftp-auth-password').toggle(method === 'password');
        $('.wpstatic-sftp-auth-key').toggle(method === 'key');
    }

    $('.wpstatic-target-radio').on('change', updateTargetSections);
    $('.wpstatic-sftp-auth-radio').on('change', updateSftpAuthSections);
    updateTargetSections();
    updateSftpAuthSections();

    // --- Navigation: only show detail fields when enabled ---------------
    function updateNavSections() {
        $('.wpstatic-nav-fields').each(function () {
            var $table = $(this);
            var enabled = $table.find('.wpstatic-nav-enabled').is(':checked');
            $table.find('.wpstatic-nav-detail').toggle(enabled);
        });
    }

    $('.wpstatic-nav-enabled').on('change', updateNavSections);
    updateNavSections();

    // --- Connection tests (SFTP / Netlify) --------------------------------
    function showTestResult($span, success, message) {
        $span.removeClass('wpstatic-test-ok wpstatic-test-fail');

        if (success) {
            $span.addClass('wpstatic-test-ok').html('&#10003; ' + message);
        } else {
            $span.addClass('wpstatic-test-fail').html('&#10007; ' + message);
        }
    }

    function ajaxPostSimple(action, data) {
        return ajaxPost(action, data);
    }

    $('#wpstatic-test-sftp-btn').on('click', function () {
        var $btn = $(this);
        var $result = $('#wpstatic-test-sftp-result');

        $btn.prop('disabled', true).text(i18n.testing);
        $result.removeClass('wpstatic-test-ok wpstatic-test-fail').text('');

        ajaxPostSimple('wpstatic_deploy_test_sftp', {
            sftp_host: $('#sftp_host').val(),
            sftp_port: $('#sftp_port').val(),
            sftp_username: $('#sftp_username').val(),
            sftp_auth_method: $('.wpstatic-sftp-auth-radio:checked').val(),
            sftp_password: $('#sftp_password').val(),
            sftp_private_key: $('#sftp_private_key').val(),
            sftp_passphrase: $('#sftp_passphrase').val(),
            sftp_remote_base_path: $('#sftp_remote_base_path').val()
        }).done(function (response) {
            if (response.success) {
                showTestResult($result, true, response.data.message);
            } else {
                showTestResult($result, false, (response.data && response.data.message) || i18n.unknownErrorPeriod);
            }
        }).fail(function () {
            showTestResult($result, false, i18n.requestToWordPressFailed);
        }).always(function () {
            $btn.prop('disabled', false).text(i18n.testConnection);
        });
    });

    $('#wpstatic-test-netlify-btn').on('click', function () {
        var $btn = $(this);
        var $result = $('#wpstatic-test-netlify-result');

        $btn.prop('disabled', true).text(i18n.testing);
        $result.removeClass('wpstatic-test-ok wpstatic-test-fail').text('');

        ajaxPostSimple('wpstatic_deploy_test_netlify', {
            netlify_site_id: $('#netlify_site_id').val(),
            netlify_token: $('#netlify_token').val()
        }).done(function (response) {
            if (response.success) {
                showTestResult($result, true, response.data.message);
            } else {
                showTestResult($result, false, (response.data && response.data.message) || i18n.unknownErrorPeriod);
            }
        }).fail(function () {
            showTestResult($result, false, i18n.requestToWordPressFailed);
        }).always(function () {
            $btn.prop('disabled', false).text(i18n.testConnection);
        });
    });

    // --- "Deploy all" with batch progress ---------------------------------
    var $btn = $('#wpstatic-deploy-all-btn');
    var $progressWrap = $('#wpstatic-deploy-progress');
    var $progressBar = $('#wpstatic-deploy-progress-bar');
    var $progressText = $('#wpstatic-deploy-progress-text');
    var $result = $('#wpstatic-deploy-result');

    function ajaxPost(action, data) {
        return $.post(wpStaticDeploy.ajaxUrl, $.extend({
            action: action,
            nonce: wpStaticDeploy.nonce
        }, data || {}));
    }

    function runBatch(total, offset) {
        ajaxPost('wpstatic_deploy_batch', {
            offset: offset,
            batch_size: wpStaticDeploy.batchSize
        }).done(function (response) {
            if (!response.success) {
                fail(response.data && response.data.message);
                return;
            }

            var data = response.data;
            var percent = total > 0 ? Math.round((data.processed / total) * 100) : 100;

            $progressBar.val(percent);
            $progressText.text('Generiere … ' + data.processed + ' / ' + total);

            if (data.errors && data.errors.length) {
                $result.append('<p style="color:#b32d2e;">' + data.errors.join('<br>') + '</p>');
            }

            if (data.done) {
                finalize();
            } else {
                runBatch(total, data.processed);
            }
        }).fail(function () {
            fail(i18n.errorBatchProcessing);
        });
    }

    function finalize() {
        $progressText.text(i18n.deployingToTarget);

        var skipAssets = !$('#wpstatic-skip-assets').is(':checked');

        ajaxPost('wpstatic_deploy_finalize', { skip_assets: skipAssets ? '1' : '0' }).done(function (response) {
            if (!response.success) {
                fail(response.data && response.data.message);
                return;
            }

            $progressBar.val(100);
            $progressText.text('Fertig.');

            var data = response.data || {};
            var url = data.deploy_url;

            if (url) {
                $result.append('<p>Deploy: <a href="' + url + '" target="_blank" rel="noopener">' + url + '</a> (' + (data.state || 'processing') + ')</p>');
            } else {
                $result.append('<p>' + (data.message || i18n.deploymentComplete) + '</p>');
            }

            if (data.wp_content_files_sample && data.wp_content_files_sample.length) {
                var list = '<ul style="margin-left:20px; list-style:disc;">' +
                    data.wp_content_files_sample.map(function (f) { return '<li><code>' + f + '</code></li>'; }).join('') +
                    '</ul>';
                $result.append('<p>Beispiel-Pfade (relativ zum Ziel-Verzeichnis):</p>' + list);
            }

            $btn.prop('disabled', false).text(i18n.deployAll);
        }).fail(function () {
            fail(i18n.errorFinalizing);
        });
    }

    function fail(message) {
        $result.append('<p style="color:#b32d2e;">' + i18n.errorPrefix + ' ' + (message || i18n.unknownError) + '</p>');
        $btn.prop('disabled', false).text(i18n.deployAll);
    }

    $btn.on('click', function () {
        if (!confirmIfUnsaved(i18n.deployAll)) {
            return;
        }

        $btn.prop('disabled', true).text(i18n.running);
        $result.empty();
        $progressWrap.show();
        $progressBar.val(0);
        $progressText.text(i18n.starting);

        ajaxPost('wpstatic_deploy_start').done(function (response) {
            if (!response.success) {
                fail(response.data && response.data.message);
                return;
            }

            var total = response.data.total;

            // First-upload protection: as long as assets have never been
            // uploaded for this target, "skip assets" must not be
            // selectable - otherwise a page could go live with no
            // CSS/images at all.
            var $skipCheckbox = $('#wpstatic-skip-assets');
            if (!response.data.assets_ever_uploaded) {
                $skipCheckbox.prop('checked', true).prop('disabled', true);
            } else {
                $skipCheckbox.prop('disabled', false);
            }

            if (total === 0) {
                fail(i18n.noMatchingPosts);
                return;
            }

            runBatch(total, 0);
        }).fail(function () {
            fail(i18n.errorStartingDeploy);
        });
    });

    // --- Deploy assets only ------------------------------------------------
    $('#wpstatic-deploy-assets-only-btn').on('click', function () {
        if (!confirmIfUnsaved(i18n.deployAssetsOnly)) {
            return;
        }

        var $assetsBtn = $(this);

        $assetsBtn.prop('disabled', true).text(i18n.deployingAssets);
        $result.empty();

        ajaxPost('wpstatic_deploy_assets_only').done(function (response) {
            if (!response.success) {
                $result.append('<p style="color:#b32d2e;">' + i18n.errorPrefix + ' ' + ((response.data && response.data.message) || i18n.unknownError) + '</p>');
                return;
            }

            var data = response.data || {};
            var url = data.deploy_url;

            if (url) {
                $result.append('<p>' + i18n.assetsDeployedWithUrl + ' <a href="' + url + '" target="_blank" rel="noopener">' + url + '</a></p>');
            } else {
                $result.append('<p>' + (data.message || i18n.assetsDeployed) + '</p>');
            }
        }).fail(function () {
            $result.append('<p style="color:#b32d2e;">' + i18n.errorRequestFailed + '</p>');
        }).always(function () {
            $assetsBtn.prop('disabled', false).text(i18n.deployAssetsOnly);
        });
    });

    // --- Field browser (Content tab) --------------------------------------
    var $fbModal = $('#wpstatic-field-browser-modal');
    var $fbPostSelect = $('#wpstatic-field-browser-post-select');
    var $fbSearch = $('#wpstatic-field-browser-search');
    var $fbShowEmpty = $('#wpstatic-field-browser-show-empty');
    var $fbResults = $('#wpstatic-field-browser-results');
    var $fbCommon = $('#wpstatic-field-browser-common');
    var $fbCommonResults = $('#wpstatic-field-browser-common-results');
    var fbFields = []; // full, unfiltered list from the last successful fetch

    // The most frequently used fields, with clean, hand-picked marker
    // names (rather than the generic auto-derived ones) - shown as a
    // quick-access shortcut above the full, searchable list.
    var FB_COMMON_FIELDS = [
        {path: 'title->rendered', marker: '###title###'},
        {path: 'content->rendered', marker: '###content###'},
        {path: 'excerpt->rendered', marker: '###excerpt###'},
        {path: 'slug', marker: '###slug###'},
        {path: 'link', marker: '###permalink###'},
        {path: 'date', marker: '###date###'}
    ];

    function fbBuildRowHtml(field, forcedMarker) {
        var badge = field.is_array
            ? '<span class="wpstatic-field-array-badge">' + i18n.fieldBrowserArrayBadge + '</span>'
            : (field.is_linked ? '<span class="wpstatic-field-linked-badge">' + i18n.fieldBrowserLinkedBadge + '</span>' : '');
        // A plain (unresolved) array field would silently produce the
        // literal text "Array" if used directly in an injection rule
        // (PHP's array-to-string conversion) - not clickable-to-insert,
        // to prevent building a rule that looks fine but is broken.
        var notInsertable = field.is_array && !field.is_linked;
        var rowClass = 'wpstatic-field-row' + (notInsertable ? ' wpstatic-field-row-disabled' : '');

        return '<div class="' + rowClass + '"'
            + ' data-path="' + $('<div>').text(field.path).html() + '"'
            + ' data-not-insertable="' + (notInsertable ? '1' : '') + '"'
            + (forcedMarker ? ' data-marker="' + $('<div>').text(forcedMarker).html() + '"' : '')
            + '>'
            + '<code>' + $('<div>').text(field.path).html() + '</code>'
            + '<span class="wpstatic-field-preview">' + $('<div>').text(field.preview).html() + '</span>'
            + badge
            + '</div>';
    }

    function fbRenderFields(fields) {
        if (fields.length === 0) {
            $fbResults.html('<p class="description">' + i18n.fieldBrowserNoMatch + '</p>');
            return;
        }

        var html = '';
        fields.forEach(function (field) {
            html += fbBuildRowHtml(field, null);
        });

        $fbResults.html(html);
    }

    function fbRenderCommonFields() {
        var byPath = {};
        fbFields.forEach(function (field) {
            byPath[field.path] = field;
        });

        var html = '';
        FB_COMMON_FIELDS.forEach(function (common) {
            var field = byPath[common.path];

            if (field) {
                html += fbBuildRowHtml(field, common.marker);
            }
        });

        if (html === '') {
            $fbCommon.hide();
        } else {
            $fbCommonResults.html(html);
            $fbCommon.show();
        }
    }

    function fbApplyFilter() {
        var term = $fbSearch.val().toLowerCase();
        var showEmpty = $fbShowEmpty.is(':checked');

        var visible = fbFields.filter(function (field) {
            return showEmpty || !field.is_empty;
        });

        if (term !== '') {
            visible = visible.filter(function (field) {
                return field.path.toLowerCase().indexOf(term) !== -1
                    || field.preview.toLowerCase().indexOf(term) !== -1;
            });
        }

        fbRenderFields(visible);
    }

    function fbLoadPosts() {
        $fbPostSelect.prop('disabled', true).html('<option value="">' + i18n.fieldBrowserLoadingPosts + '</option>');

        ajaxPost('wpstatic_field_browser_posts', {}).done(function (response) {
            if (!response.success) {
                $fbPostSelect.html('<option value="">' + ((response.data && response.data.message) || i18n.unknownError) + '</option>');
                return;
            }

            var posts = (response.data && response.data.posts) || [];

            if (posts.length === 0) {
                $fbPostSelect.html('<option value="">' + i18n.fieldBrowserNoPosts + '</option>');
                return;
            }

            var options = '<option value="">' + i18n.fieldBrowserSelectPost + '</option>';
            posts.forEach(function (post) {
                options += '<option value="' + post.id + '">' + $('<div>').text(post.title).html() + ' (' + post.post_type + ')</option>';
            });

            $fbPostSelect.prop('disabled', false).html(options);
        }).fail(function () {
            $fbPostSelect.html('<option value="">' + i18n.errorRequestFailed + '</option>');
        });
    }

    function fbLoadFields(postId) {
        fbFields = [];
        $fbCommon.hide();
        $fbResults.html('<p class="description">' + i18n.fieldBrowserLoadingFields + '</p>');

        ajaxPost('wpstatic_field_browser_fields', {post_id: postId}).done(function (response) {
            if (!response.success) {
                $fbResults.html('<p style="color:#b32d2e;">' + ((response.data && response.data.message) || i18n.unknownError) + '</p>');
                return;
            }

            fbFields = (response.data && response.data.fields) || [];
            fbRenderCommonFields();
            fbApplyFilter();
        }).fail(function () {
            $fbResults.html('<p style="color:#b32d2e;">' + i18n.errorRequestFailed + '</p>');
        });
    }

    $('#wpstatic-field-browser-open-btn').on('click', function () {
        $fbModal.show();
        $fbSearch.val('');
        $fbShowEmpty.prop('checked', false);
        fbFields = [];
        $fbCommon.hide();
        $fbResults.html('<p class="description">' + i18n.fieldBrowserSelectPrompt + '</p>');
        fbLoadPosts();
    });

    $('#wpstatic-field-browser-close-btn').on('click', function () {
        $fbModal.hide();
    });

    $fbModal.on('click', function (event) {
        if (event.target === this) {
            $fbModal.hide();
        }
    });

    $fbPostSelect.on('change', function () {
        var postId = $(this).val();
        $fbSearch.val('');

        if (postId) {
            fbLoadFields(postId);
        } else {
            fbFields = [];
            $fbCommon.hide();
            $fbResults.html('<p class="description">' + i18n.fieldBrowserSelectPrompt + '</p>');
        }
    });

    $fbSearch.on('input', fbApplyFilter);
    $fbShowEmpty.on('change', fbApplyFilter);

    $fbResults.add($fbCommonResults).on('click', '.wpstatic-field-row', function () {
        var $row = $(this);

        if ($row.data('not-insertable')) {
            var originalWarningHtml = $row.html();
            $row.append(' <em>' + i18n.fieldBrowserNotInsertable + '</em>');
            setTimeout(function () {
                $row.html(originalWarningHtml);
            }, 4000);
            return;
        }

        var path = $row.data('path');
        var marker = $row.data('marker') || ('###' + String(path).replace(/->/g, '_').replace(/[^a-zA-Z0-9_]/g, '_') + '###');
        var $textarea = $('#data_injection_rules');
        var newLine = path + ' => ' + marker;
        var current = $textarea.val();

        $textarea.val(current === '' ? newLine : current.replace(/\n*$/, '') + '\n' + newLine);
        $textarea.trigger('change'); // so the "unsaved changes" tracking picks this up

        var originalHtml = $row.html();
        $row.append(' <em>(' + i18n.fieldBrowserInserted + ')</em>');
        setTimeout(function () {
            $row.html(originalHtml);
        }, 1200);
    });
});
