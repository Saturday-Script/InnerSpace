/**
 * InnerSpace Data Manager
 * Handles export/import of all user data from/to localStorage.
 * Works under file:// protocol (no server required).
 */
(function () {
    'use strict';

    // All localStorage keys used by InnerSpace
    var DATA_KEYS = [
        'innerspace_results',
        'innerspace_username',
        'innerspace_userid',
        'innerspace_sandbox_history',
        'innerspace_sandbox_session',
        'innerspace_session_core',
        'innerspace_session_emotion',
        'innerspace_session_shadow',
        'innerspace_api_key'
    ];

    /**
     * Export all InnerSpace data as a JSON file download.
     */
    function exportData() {
        var data = {};
        var hasData = false;

        for (var i = 0; i < DATA_KEYS.length; i++) {
            var key = DATA_KEYS[i];
            try {
                var val = localStorage.getItem(key);
                if (val !== null) {
                    data[key] = val;
                    hasData = true;
                }
            } catch (e) {}
        }

        if (!hasData) {
            alert('当前没有任何数据可以导出。');
            return;
        }

        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);

        var a = document.createElement('a');
        a.href = url;
        var timestamp = new Date().toISOString().slice(0, 10);
        var username = localStorage.getItem('innerspace_username') || 'unknown';
        a.download = 'innerspace_' + username + '_' + timestamp + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Import InnerSpace data from a JSON file.
     * Opens a file picker, reads the file, and writes to localStorage.
     */
    function importData() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';

        input.addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (!file) return;

            var reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    var data = JSON.parse(ev.target.result);

                    // Validate: must be an object with at least one known key
                    var validKeys = 0;
                    for (var i = 0; i < DATA_KEYS.length; i++) {
                        if (data.hasOwnProperty(DATA_KEYS[i])) validKeys++;
                    }

                    if (validKeys === 0) {
                        alert('无效的数据文件：未找到 InnerSpace 数据。');
                        return;
                    }

                    var confirmMsg = '即将导入数据文件，这会覆盖当前浏览器中的所有 InnerSpace 数据。\n\n确定要继续吗？';
                    if (!confirm(confirmMsg)) return;

                    // Clear existing data first
                    for (var j = 0; j < DATA_KEYS.length; j++) {
                        try { localStorage.removeItem(DATA_KEYS[j]); } catch (e) {}
                    }

                    // Write imported data
                    for (var key in data) {
                        if (data.hasOwnProperty(key)) {
                            try {
                                localStorage.setItem(key, data[key]);
                            } catch (e) {}
                        }
                    }

                    alert('数据导入成功！页面即将刷新。');
                    window.location.reload();
                } catch (err) {
                    alert('数据文件解析失败：' + err.message);
                }
            };
            reader.readAsText(file);
        });

        input.click();
    }

    /**
     * Clear all InnerSpace data from localStorage.
     */
    function clearData() {
        var confirmMsg = '确定要清除所有 InnerSpace 数据吗？\n\n这将删除所有测评结果、推演记录和用户信息。此操作不可撤销。';
        if (!confirm(confirmMsg)) return;

        for (var i = 0; i < DATA_KEYS.length; i++) {
            try { localStorage.removeItem(DATA_KEYS[i]); } catch (e) {}
        }

        alert('所有数据已清除。页面即将刷新。');
        window.location.reload();
    }

    // Expose globally
    window.DataManager = {
        export: exportData,
        import: importData,
        clear: clearData
    };
})();
