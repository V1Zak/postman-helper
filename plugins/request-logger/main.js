// Request Logger Plugin — logs all sent requests and responses to the console

module.exports = {
    activate(api) {
        api.log('Request Logger plugin activated');
    },

    onBeforeRequestSend(data, api) {
        api.log(`Sending: ${data.method || 'GET'} ${data.url || '(no url)'}`);
        return data;
    },

    onResponseReceive(data, api) {
        const status = data.response ? data.response.status : '?';
        const time = data.time || 0;
        api.log(`Response: ${status} (${time}ms)`);
        return data;
    },

    deactivate() {
        console.log('[plugin:request-logger] Deactivated');
    }
};
