import { Octokit } from '@octokit/rest'
import inquirer from 'inquirer'
import ora from 'ora'

const spinner = ora('Loading')

if (process.env.GITHUB_TOKEN?.length < 0)
// eslint-disable-next-line no-throw-literal
	throw 'Please set GITHUB_TOKEN environment variable'




const octokit = new Octokit({
	auth: process.env.GITHUB_TOKEN,
})


const selectConlusionEmoji = conclusion => {
	switch (conclusion) {
		case 'success':
			return '✅'
		case 'failure':
			return '❌'
		default:
			return ''
	}
}

const selectStatusEmoji = status => {
	switch (status) {
		case 'completed':
			return '🏁'
		case 'queued':
			return '⌛'
		default:
			return ''
	}
}

const categories = [ 'Merge PRs'/* , 'Report TS', 'Report unit test metrics' */ ]

const getOrganizations = async () => {
	spinner.start()

	spinner.color = 'yellow'
	spinner.text = 'Checking user'
	const { data: user } = await octokit.rest.users.getAuthenticated()


	spinner.color = 'green'
	spinner.text = 'Checking orgs'
	const { data: orgs } = await octokit.rest.orgs.listForUser({ username: user.login })

	spinner.stop()

	return orgs
}

const getRepos = async org => {
	spinner.start()

	spinner.color = 'red'
	spinner.text = 'Checking repos'
	const { data: repos1 } = await octokit.rest.repos.listForOrg({ org,
		sort: 'full_name',
		per_page: 100 })
	const { data: repos2 } = await octokit.rest.repos.listForOrg({ org,
		sort: 'full_name',
		per_page: 100,
		page: 2 })
	const { data: repos3 } = await octokit.rest.repos.listForOrg({ org,
		sort: 'full_name',
		per_page: 100,
		page: 3 })
	spinner.stop()

	return [ ...repos1, ...repos2, ...repos3 ].filter(repo => repo.archived === false)
}


const getPrs = async ({ repo, owner }) => {
	spinner.start()

	spinner.color = 'magenta'
	spinner.text = 'Checking pulls'
	const { data: prs } = await octokit.rest.pulls.list({
		owner,
		repo,
	})

	spinner.stop()


	return prs
}

const mergePRs = async () => {
	const organizations = await getOrganizations()
	const { Organization } = await inquirer
		.prompt([
			{ type: 'list',
				name: 'Organization',
				choices: organizations.map(({ login, ...rest }) => ({ name: login,
					...rest })) },
		])

	const selectedOrg = organizations.find(({ login }) => login === Organization)
	const repos = await getRepos(selectedOrg.login)
	const repoTopics = Array.from(repos.reduce((memo, repo) => {
		repo.topics.forEach(topic => memo.add(topic))

		return memo
	}, new Set())).sort()

	// console.warn({ repoTopics })

	const { Topics } = await inquirer
		.prompt([ { type: 'checkbox',
			name: 'Topics',
			message: 'Please select topics to filter',
			choices: repoTopics } ])




	const { Repos } = await inquirer
		.prompt([ { type: 'checkbox',
			name: 'Repos',
			message: 'Please select repos',
			choices: repos.filter(repo => Topics?.length > 0 ? Topics.map(Topic => repo.topics.includes(Topic)).every(Boolean) : true) } ])


	const prs = (await Promise.all(repos.filter(repo => Repos.length > 0 ? Repos.includes(repo.name) : true).map(({ name }) => getPrs({ owner: Organization,
		repo: name })))).reduce((memo, repoPrs) => [ ...memo, ...repoPrs ], [])


	const labels = Array.from(prs.reduce((memo, pr) => {
		pr.labels.map(label => memo.add(label.name))

		return memo
	}, new Set()))


	const { Labels } = await inquirer
		.prompt([ { type: 'checkbox',
			name: 'Labels',
			message: 'Please select labels to list PRs',
			choices: labels } ])
	let filteredPRs = prs.filter(pr => Labels.map(Label => pr.labels.find(({ name }) => name === Label)).every(Boolean))


	const checks = await Promise.all(filteredPRs.map(selectedPR => octokit.rest.checks.listSuitesForRef({
		owner: selectedOrg.login,
		repo: selectedPR.head.repo.name,
		ref: selectedPR.head.ref,
	})))

	filteredPRs = filteredPRs.map(selectedPR => {
		// eslint-disable-next-line camelcase
		const CircleChecks = checks.find(({ data: { check_suites } }) => check_suites.find(({ head_branch }) => head_branch === selectedPR.head.ref)).data.check_suites.filter(check => check.app.slug === 'circleci-checks')


		return { ...selectedPR,
			circleStatus: CircleChecks?.length > 0 ? CircleChecks.reduce((memo, { status }) => `${ memo ? memo + ',' : '' }${ status }`, '') : '',
			circleConclusion: CircleChecks?.length > 0 ? CircleChecks.reduce((memo, { conclusion }) => `${ memo ? memo + ',' : '' }${ conclusion }`, '') : '',
			checks: CircleChecks }
	})


	const { Merge } = await inquirer
		.prompt([ { type: 'checkbox',
			name: 'Merge',
			message: 'Please select pr\'s to merge from list',
			// eslint-disable-next-line camelcase
			choices: filteredPRs.map(({ title, html_url, ...others }) => ({ name: `[${ selectStatusEmoji(others.circleStatus) } ${ selectConlusionEmoji(others.circleConclusion) } ] ${ title } - ${ html_url }`,
				title,
				// eslint-disable-next-line camelcase
				html_url,
				...others })) } ])
	const selectedPrs = Merge.map(title => filteredPRs.find(pr => title.split(` - `)[1] === pr.html_url))

	const reviews = await Promise.all(selectedPrs.map(selectedPR => octokit.rest.pulls.createReview({ owner: selectedOrg.login,
		repo: selectedPR.head.repo.name,
		pull_number: selectedPR.number,
		event: 'APPROVE' })))

	const merges = await Promise.all(selectedPrs.map(selectedPR => octokit.rest.pulls.merge({ owner: selectedOrg.login,
		repo: selectedPR.head.repo.name,
		pull_number: selectedPR.number })))


	console.warn({ reviews,
		merges })
}

const index = function () {

	inquirer
		.prompt([
			{ type: 'list',
				name: 'Category',
				choices: categories },
		])
		.then(({ Category }) => {

			switch (Category) {
				case categories[0]:
					return mergePRs()
			}



			// Use user feedback for... whatever!!
		})
		.catch(error => {
			if (error.isTtyError)
				console.warn('Seems we can\'t render CLI here!')
			// Prompt couldn't be rendered in the current environment
			else
				console.warn('Something went wrong!', { error })
			// Something else went wrong

			throw error
		})


	return
}

export default index
