const normalizeUrl = require('normalize-url');
const axios = require('axios');
const ProjectModel = require('../models/project');

const platformURLs = {
  KS: 'https://kickstarter.com/projects',
  IG: 'https://indiegogo.com/projects',
};

module.exports = async (siteType, url, projectId = null) => {
  const platformURL = platformURLs[siteType];
  if (!platformURL) throw new Error('Invalid site type');

  const normalizationRules = {
    removeTrailingSlash: true,
    stripWWW: true,
    stripHash: true,
    forceHttps: true,
    removeQueryParameters: [/.*/],
  };

  let normalizedUrl;
  try {
    normalizedUrl = normalizeUrl(url, normalizationRules);
  } catch {
    throw new Error('Invalid url');
  }

  if (!normalizedUrl.startsWith(platformURL)) {
    throw new Error(`Incorrect URL for the ${siteType} platform`);
  }

  let projectUrl;
  try {
    const { request } = await axios.default.get(normalizedUrl);
    projectUrl = normalizeUrl(request.res.responseUrl, normalizationRules);
    if (!projectUrl.startsWith(platformURL)) throw new Error();
  } catch {
    throw new Error("Specified URL doesn't reference a project");
  }

  const searchUrl = normalizeUrl(projectUrl, { ...normalizationRules, stripProtocol: true });
  const existingProject = await ProjectModel.findOne({ url: { $regex: searchUrl } });

  if (existingProject && existingProject.id !== projectId) {
    throw new Error('This project was already added by a different account, please contact our support team');
  }

  return normalizedUrl;
};
