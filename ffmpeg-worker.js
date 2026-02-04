'use strict';

class FFmpegWorker {
    async load() {
        throw new Error('FFmpeg worker 已移除，请改用自研管线 PipelineController');
    }

    async convert() {
        throw new Error('FFmpeg worker 已移除，请改用自研管线 PipelineController');
    }
}

module.exports = FFmpegWorker;
